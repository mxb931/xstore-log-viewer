const express = require('express');
const axios = require('axios');
const https = require('https');
const cheerio = require('cheerio');
const archiver = require('archiver');
const { StringDecoder } = require('string_decoder');

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

function parseChunkMode(mode) {
  return mode === 'head' ? 'head' : 'tail';
}

function parseChunkLineLimit(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return 2000;
  if (parsed < 100) return 100;
  if (parsed > 20000) return 20000;
  return parsed;
}

function splitLines(buffer) {
  return buffer.split(/\r?\n/);
}

function parseContentRange(contentRange) {
  if (!contentRange) return null;
  const m = String(contentRange).match(/^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i);
  if (!m) return null;
  const start = Number.parseInt(m[1], 10);
  const end = Number.parseInt(m[2], 10);
  const total = m[3] === '*' ? null : Number.parseInt(m[3], 10);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return { start, end, total: Number.isFinite(total) ? total : null };
}

function linesFromText(text) {
  const normalized = String(text || '').replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

async function tryFetchTailChunkWithRange(url, lineLimit, maxBytes) {
  const response = await axios.get(url, {
    httpsAgent: insecureAgent,
    timeout: 60000,
    responseType: 'stream',
    headers: {
      'User-Agent': 'XstoreLogViewer/1.0',
      Range: `bytes=-${maxBytes}`,
    },
    validateStatus: (status) => status === 206 || (status >= 200 && status < 300),
  });

  // Upstream ignored byte ranges; caller should use streaming fallback.
  if (response.status !== 206) {
    response.data.destroy();
    return null;
  }

  const decoder = new StringDecoder('utf8');
  let text = '';
  await new Promise((resolve, reject) => {
    response.data.on('data', (chunk) => {
      text += decoder.write(chunk);
    });
    response.data.on('end', resolve);
    response.data.on('error', reject);
  });
  text += decoder.end();

  const contentRange = parseContentRange(response.headers['content-range']);
  const partialPrefix = contentRange && contentRange.start > 0;

  // A byte-range often starts in the middle of a line; discard that fragment.
  if (partialPrefix) {
    const firstBreak = text.search(/\r?\n/);
    if (firstBreak !== -1) {
      text = text.slice(firstBreak + 1);
    }
  }

  const rawLines = linesFromText(text);
  const truncatedByLineLimit = rawLines.length > lineLimit;
  const lines = truncatedByLineLimit ? rawLines.slice(-lineLimit) : rawLines;

  return {
    lines,
    truncated: Boolean(partialPrefix || truncatedByLineLimit),
  };
}

async function fetchLogChunk(url, mode, lineLimit) {
  const response = await axios.get(url, {
    httpsAgent: insecureAgent,
    timeout: 120000,
    responseType: 'stream',
    headers: { 'User-Agent': 'XstoreLogViewer/1.0' },
  });

  const stream = response.data;
  const decoder = new StringDecoder('utf8');
  let tailBuffer = '';
  let done = false;
  let truncated = false;
  const lines = [];

  const tryFinalize = (resolve) => {
    if (done) return;
    done = true;
    resolve({ lines, truncated });
  };

  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => {
      if (done) return;

      const text = decoder.write(chunk);
      if (!text) return;

      tailBuffer += text;
      const parts = splitLines(tailBuffer);
      tailBuffer = parts.pop() || '';

      for (const line of parts) {
        if (mode === 'head') {
          if (lines.length < lineLimit) {
            lines.push(line);
          } else {
            truncated = true;
            done = true;
            stream.destroy();
            resolve({ lines, truncated });
            return;
          }
        } else {
          if (lines.length === lineLimit) {
            lines.shift();
            truncated = true;
          }
          lines.push(line);
        }
      }
    });

    stream.on('end', () => {
      if (done) return;

      const remainder = tailBuffer + decoder.end();
      if (remainder.length > 0) {
        if (mode === 'head') {
          if (lines.length < lineLimit) {
            lines.push(remainder);
          } else {
            truncated = true;
          }
        } else {
          if (lines.length === lineLimit) {
            lines.shift();
            truncated = true;
          }
          lines.push(remainder);
        }
      }

      tryFinalize(resolve);
    });

    stream.on('close', () => {
      if (done) return;
      tryFinalize(resolve);
    });

    stream.on('error', (err) => {
      if (done) return;
      reject(err);
    });
  });
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
 * GET /api/logs/:storeNumber/:filename/chunk?mode=head|tail&lines=2000
 * Returns a partial log payload optimized for fast first render.
 */
router.get('/:storeNumber/:filename/chunk', async (req, res) => {
  const { storeNumber, filename } = req.params;

  if (!isValidStoreNumber(storeNumber)) {
    return res.status(400).json({
      error: 'Invalid store ID. Use letters, numbers, and optional hyphens only.',
    });
  }

  if (!isValidFilename(filename)) {
    return res.status(400).json({ error: 'Invalid filename.' });
  }

  const mode = parseChunkMode(req.query.mode);
  const lineLimit = parseChunkLineLimit(req.query.lines);
  const url = `${storeBaseUrl(storeNumber)}${encodeURIComponent(filename)}`;

  try {
    if (mode === 'tail') {
      const rangeResult = await tryFetchTailChunkWithRange(url, lineLimit, 2 * 1024 * 1024);
      if (rangeResult) {
        return res.json({
          storeNumber,
          filename,
          mode,
          lineLimit,
          truncated: rangeResult.truncated,
          lines: rangeResult.lines,
        });
      }
    }

    const { lines, truncated } = await fetchLogChunk(url, mode, lineLimit);
    return res.json({
      storeNumber,
      filename,
      mode,
      lineLimit,
      truncated,
      lines,
    });
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
    console.error(`Error fetching chunk for ${filename} from store ${storeNumber}:`, err.message);
    return res.status(500).json({ error: 'An unexpected error occurred while fetching the log chunk.' });
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
      timeout: 120000,
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
