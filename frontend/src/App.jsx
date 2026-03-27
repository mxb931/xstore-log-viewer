import { useState, useCallback } from 'react';
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
      <header className="bg-gray-900 border-b border-gray-700 px-5 py-3 flex items-center gap-4 shrink-0">
        <div className="flex items-center gap-2">
          {/* Sherwin-Williams inspired logo mark */}
          <div className="w-7 h-7 rounded-full bg-red-600 flex items-center justify-center text-white font-black text-xs leading-none select-none">
            SW
          </div>
          <span className="font-bold text-gray-100 text-base tracking-tight">
            Xstore Log Viewer
          </span>
        </div>
        {storeNumber && files && (
          <span className="text-xs text-gray-400 ml-2">
            Store #{storeNumber} &mdash; {files.length} file{files.length !== 1 ? 's' : ''}
          </span>
        )}
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="w-64 shrink-0 flex flex-col border-r border-gray-700 bg-gray-900">
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
