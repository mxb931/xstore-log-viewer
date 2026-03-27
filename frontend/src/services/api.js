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
