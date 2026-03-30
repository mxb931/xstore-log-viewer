const express = require('express');
const axios = require('axios');
const https = require('https');
const cheerio = require('cheerio');
const archiver = require('archiver');

const router = express.Router();

// Custom HTTPS agent that bypasses self-signed / internal CA certificate errors.
// This is intentional: store systems use an internal CA not trusted by the OS.
// The bypass is server-side only — the browser never sees a certificate warning.
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * Build the base URL for a given store number.
 * Pattern: https://xstore.{storeNumber}-ingress.stores.sherwin.com/shw-logs/
 */
function storeBaseUrl(storeNumber) {
  return `https://xstore.${storeNumber}-ingress.stores.sherwin.com/shw-logs/`;
}

/**
 * Validate that a store ID is safe for use in subdomain construction.
 * Supports numeric and alphanumeric QA store IDs (e.g. 701244, lb5000).
 */
function isValidStoreNumber(storeNumber) {
  return /^[A-Za-z0-9-]{1,32}$/.test(storeNumber);
}

/**
 * Validate that a filename is safe: no path separators or null bytes.
 */
function isValidFilename(filename) {
  return (
    filename.length > 0 &&
    filename.length <= 255 &&
    !filename.includes('/') &&
    !filename.includes('\\') &&
    !filename.includes('\u0000')
  );
}

/**
 * GET /api/logs/:storeNumber
 * Fetches the /shw-logs/ directory listing from the target store and returns
 * a JSON array of { name, size, lastModified } objects.
 */
router.get('/:storeNumber', async (req, res) => {
  const { storeNumber } = req.params;

  if (!isValidStoreNumber(storeNumber)) {
    return res.status(400).json({
      error: 'Invalid store ID. Use letters, numbers, and optional hyphens only.',
    });
  }

  const url = storeBaseUrl(storeNumber);

  try {
    const response = await axios.get(url, {
      httpsAgent: insecureAgent,
      timeout: 15000,
      headers: { 'User-Agent': 'XstoreLogViewer/1.0' },
    });

    const $ = cheerio.load(response.data);
    const files = [];

    // Apache / Nginx auto-index directory listings use <a href="..."> for each file.
    // We skip parent directory links (?C=*, .., /) and keep actual file entries.
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (
        !href ||
        href.startsWith('?') ||
        href === '../' ||
        href === '/' ||
        href.endsWith('/')
      ) {
        return;
      }

      // Extract just the filename — href may be an absolute path like /shw-logs/file.log
      const decoded = decodeURIComponent(href);
      const filename = decoded.split('/').filter(Boolean).pop();
      if (!filename) return;

      // Prefer structured columns when available (Jetty autoindex format).
      const rowEl = $(el).closest('tr');
      const lastModifiedCell = rowEl.find('td.lastmodified').first().text().replace(/\u00a0/g, ' ').trim();
      const sizeCell = rowEl.find('td.size').first().text().replace(/\u00a0/g, ' ').trim();

      // Fallback for other index formats where structured cells are absent.
      const rowText = rowEl.length ? rowEl.text() : $(el).parent().text();
      const dateMatch = rowText.match(
        /(\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}(?::\d{2})?|\d{2}-\w{3}-\d{4}\s+\d{2}:\d{2}|\w{3}\s+\d{1,2},\s+\d{4},\s+\d{1,2}:\d{2}:\d{2}\s+[AP]M)/
      );
      const sizeMatch = rowText.match(/(\d[\d,]*(?:\.\d+)?\s*(?:bytes|[KMG]B?|B))/i);

      files.push({
        name: filename,
        size: sizeCell || (sizeMatch ? sizeMatch[1].trim() : ''),
        lastModified: lastModifiedCell || (dateMatch ? dateMatch[1].trim() : ''),
      });
    });

    res.json({ storeNumber, files });
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
      return res.status(503).json({
        error: `Could not connect to store ${storeNumber}. The system may be offline or unreachable.`,
      });
    }
    if (err.response) {
      return res.status(err.response.status).json({
        error: `Store ${storeNumber} returned HTTP ${err.response.status}.`,
      });
    }
    console.error(`Error fetching directory for store ${storeNumber}:`, err.message);
    res.status(500).json({ error: 'An unexpected error occurred while fetching the log directory.' });
  }
});

/**
 * GET /api/logs/:storeNumber/:filename
 * Streams the raw text content of a single log file back to the client.
 */
router.get('/:storeNumber/:filename', async (req, res) => {
  const { storeNumber, filename } = req.params;

  if (!isValidStoreNumber(storeNumber)) {
    return res.status(400).json({
      error: 'Invalid store ID. Use letters, numbers, and optional hyphens only.',
    });
  }

  if (!isValidFilename(filename)) {
    return res.status(400).json({ error: 'Invalid filename.' });
  }

  const url = `${storeBaseUrl(storeNumber)}${encodeURIComponent(filename)}`;

  try {
    const response = await axios.get(url, {
      httpsAgent: insecureAgent,
      timeout: 30000,
      responseType: 'stream',
      headers: { 'User-Agent': 'XstoreLogViewer/1.0' },
    });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    response.data.pipe(res);
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
      return res.status(503).json({
        error: `Could not connect to store ${storeNumber}. The system may be offline or unreachable.`,
      });
    }
    if (err.response) {
      return res.status(err.response.status).json({
        error: `Store ${storeNumber} returned HTTP ${err.response.status} for file "${filename}".`,
      });
    }
    console.error(`Error fetching log file ${filename} from store ${storeNumber}:`, err.message);
    res.status(500).json({ error: 'An unexpected error occurred while fetching the log file.' });
  }
});

/**
 * POST /api/logs/:storeNumber/download
 * Body: { filenames: string[] }
 * Streams a ZIP archive of selected log files.
 */
router.post('/:storeNumber/download', async (req, res) => {
  const { storeNumber } = req.params;

  if (!isValidStoreNumber(storeNumber)) {
    return res.status(400).json({
      error: 'Invalid store ID. Use letters, numbers, and optional hyphens only.',
    });
  }

  const requestFilenames = Array.isArray(req.body?.filenames) ? req.body.filenames : [];
  const filenames = [...new Set(requestFilenames.map((v) => String(v).trim()).filter(Boolean))];

  if (filenames.length === 0) {
    return res.status(400).json({ error: 'No filenames were provided for download.' });
  }

  for (const filename of filenames) {
    if (!isValidFilename(filename)) {
      return res.status(400).json({ error: `Invalid filename: ${filename}` });
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const zipFilename = `xstore-${storeNumber}-${timestamp}.zip`;

  // Allow large, long-running ZIP jobs without server-side request timeouts.
  req.setTimeout(0);
  res.setTimeout(0);

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
  res.setHeader('Cache-Control', 'no-store');

  // Use no-compression mode for speed and reliability on very large logs.
  const archive = archiver('zip', { zlib: { level: 0 } });
  const errors = [];
  let clientClosed = false;

  // Do not use req.close here: for POST requests it can fire after the request
  // body is read even while the response is still streaming. Track response close
  // so we only abort when the client disconnects before completion.
  res.on('close', () => {
    if (!res.writableEnded) {
      clientClosed = true;
      archive.abort();
    }
  });

  archive.on('warning', (err) => {
    console.warn('ZIP warning:', err.message);
  });

  archive.on('error', (err) => {
    console.error('ZIP stream error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to build ZIP archive.' });
      return;
    }
    if (!res.writableEnded) {
      res.end();
    }
  });

  archive.pipe(res);

  try {
    for (const filename of filenames) {
      if (clientClosed) break;

      const url = `${storeBaseUrl(storeNumber)}${encodeURIComponent(filename)}`;
      try {
        const response = await axios.get(url, {
          httpsAgent: insecureAgent,
          timeout: 0,
          responseType: 'stream',
          headers: { 'User-Agent': 'XstoreLogViewer/1.0' },
        });

        archive.append(response.data, { name: filename, store: true });

        // Read one upstream file completely before requesting the next one.
        // This avoids too many concurrent long-lived streams for large selections.
        await new Promise((resolve, reject) => {
          response.data.on('end', resolve);
          response.data.on('error', reject);
        });
      } catch (err) {
        let reason = err.message || 'Unknown error';
        if (err.response) {
          reason = `HTTP ${err.response.status}`;
        } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
          reason = `Connection failure (${err.code})`;
        }
        errors.push(`${filename} - ${reason}`);
      }
    }

    if (errors.length > 0 && !clientClosed) {
      const summaryLines = [
        'Some selected files could not be downloaded.',
        '',
        ...errors.map((line, idx) => `${idx + 1}. ${line}`),
        '',
        `Total requested: ${filenames.length}`,
        `Downloaded: ${filenames.length - errors.length}`,
        `Failed: ${errors.length}`,
      ];
      archive.append(summaryLines.join('\n'), { name: 'download-errors.txt' });
    }

    if (!clientClosed) {
      await archive.finalize();
    }
  } catch (err) {
    console.error(`Error creating ZIP for store ${storeNumber}:`, err.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'An unexpected error occurred while creating ZIP download.' });
    }
    if (!res.writableEnded) {
      res.end();
    }
  }
});

module.exports = router;
