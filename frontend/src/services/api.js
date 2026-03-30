import axios from 'axios';

const api = axios.create({
  // In dev, Vite proxies /api to localhost:3001.
  // In production, same origin serves both frontend and backend.
  baseURL: '/api',
  timeout: 30000,
});

/**
 * Fetch the directory listing for a given store number.
 * @param {string} storeNumber
 * @returns {Promise<{ storeNumber: string, files: Array<{ name: string, size: string, lastModified: string }> }>}
 */
export async function fetchDirectory(storeNumber) {
  const { data } = await api.get(`/logs/${encodeURIComponent(storeNumber)}`);
  return data;
}

/**
 * Fetch the raw text content of a log file.
 * @param {string} storeNumber
 * @param {string} filename
 * @returns {Promise<string>}
 */
export async function fetchLogFile(storeNumber, filename) {
  const { data } = await api.get(
    `/logs/${encodeURIComponent(storeNumber)}/${encodeURIComponent(filename)}`,
    { responseType: 'text' }
  );
  return data;
}

function extractFilenameFromContentDisposition(disposition) {
  if (!disposition) return null;
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match?.[1] || null;
}

function buildDefaultZipFilename(storeNumber) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `xstore-${storeNumber}-${timestamp}.zip`;
}

async function extractDownloadErrorMessageFromResponse(response) {
  try {
    const text = await response.text();
    if (!text) return 'ZIP download failed.';
    try {
      const parsed = JSON.parse(text);
      return parsed.error || text;
    } catch {
      return text;
    }
  } catch {
    return 'ZIP download failed.';
  }
}

/**
 * Download selected log files as a ZIP archive.
 * @param {string} storeNumber
 * @param {string[]} filenames
 * @param {(progress: { loaded: number, total: number, percent: number | null }) => void} [onProgress]
 */
export async function downloadLogsZip(storeNumber, filenames, onProgress) {
  try {
    const response = await fetch(`/api/logs/${encodeURIComponent(storeNumber)}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filenames }),
    });

    if (!response.ok) {
      throw new Error(await extractDownloadErrorMessageFromResponse(response));
    }

    const contentDisposition = response.headers.get('content-disposition');
    const filename =
      extractFilenameFromContentDisposition(contentDisposition) ||
      buildDefaultZipFilename(storeNumber);

    const total = Number(response.headers.get('content-length') || 0);

    let blob;
    if (response.body) {
      const reader = response.body.getReader();
      const chunks = [];
      let loaded = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.byteLength;
        if (onProgress) {
          onProgress({
            loaded,
            total,
            percent: total > 0 ? loaded / total : null,
          });
        }
      }
      blob = new Blob(chunks, { type: 'application/zip' });
    } else {
      blob = await response.blob();
      if (onProgress) {
        const loaded = blob.size;
        onProgress({
          loaded,
          total,
          percent: total > 0 ? loaded / total : null,
        });
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  } catch (err) {
    throw new Error(err.message || 'ZIP download failed.');
  }
}
