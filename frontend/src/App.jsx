import { useState, useEffect, useCallback } from 'react';
import StoreSelector from './components/StoreSelector';
import LogFileList from './components/LogFileList';
import FilterPanel from './components/FilterPanel';
import LogViewer from './components/LogViewer';
import { fetchDirectory } from './services/api';

const DEFAULT_FILTERS = {
  text: '',
  isRegex: false,
  levels: new Set(),
  dateFrom: '',
  dateTo: '',
};

export default function App() {
  const [storeNumber, setStoreNumber] = useState('');
  const [files, setFiles] = useState(null);
  const [dirLoading, setDirLoading] = useState(false);
  const [dirError, setDirError] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [dark, setDark] = useState(() => localStorage.getItem('theme') !== 'light');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  const handleConnect = useCallback(async (number) => {
    setStoreNumber(number);
    setDirLoading(true);
    setDirError('');
    setFiles(null);
    setSelectedFile(null);
    setFilters(DEFAULT_FILTERS);

    try {
      const { files: fetchedFiles } = await fetchDirectory(number);
      setFiles(fetchedFiles);
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data ||
        err.message ||
        'Could not connect to store.';
      setDirError(String(msg));
    } finally {
      setDirLoading(false);
    }
  }, []);

  const handleFileSelect = useCallback((file) => {
    setSelectedFile(file);
    setFilters(DEFAULT_FILTERS);
  }, []);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <header className="bg-gray-50 border-b border-gray-200 dark:bg-gray-900 dark:border-gray-700 px-5 py-3 flex items-center gap-4 shrink-0">
        <div className="flex items-center gap-2">
          {/* Sherwin-Williams inspired logo mark */}
          <div className="w-7 h-7 rounded-full bg-red-600 flex items-center justify-center text-white font-black text-xs leading-none select-none">
            SW
          </div>
          <span className="font-bold text-gray-900 dark:text-gray-100 text-base tracking-tight">
            Xstore Log Viewer
          </span>
        </div>
        {storeNumber && files && (
          <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
            Store #{storeNumber} &mdash; {files.length} file{files.length !== 1 ? 's' : ''}
          </span>
        )}
        <button
          onClick={() => setDark((d) => !d)}
          title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="ml-auto p-1.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          {dark ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
            </svg>
          )}
        </button>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="w-64 shrink-0 flex flex-col border-r border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
          <StoreSelector onConnect={handleConnect} disabled={dirLoading} />
          <LogFileList
            files={files}
            selectedFile={selectedFile}
            onSelect={handleFileSelect}
            loading={dirLoading}
            error={dirError}
          />
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col min-w-0">
          {selectedFile ? (
            <>
              <FilterPanel filters={filters} onChange={setFilters} />
              <LogViewer
                storeNumber={storeNumber}
                file={selectedFile}
                filters={filters}
              />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-600 gap-3 select-none">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-14 h-14 opacity-30"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <p className="text-sm">
                {files
                  ? 'Select a log file from the sidebar'
                  : 'Enter a store number to get started'}
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
