import { useState, useEffect, useCallback, useRef } from 'react';
import StoreSelector from './components/StoreSelector';
import LogFileList from './components/LogFileList';
import FilterPanel from './components/FilterPanel';
import LogViewer from './components/LogViewer';
import { fetchDirectory, downloadLogsZip } from './services/api';

function createDefaultFilters() {
  return {
    text: '',
    isRegex: false,
    levels: new Set(),
    dateFrom: '',
    dateTo: '',
  };
}

function formatFileSize(bytes) {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unitIndex]}`;
}

export default function App() {
  const [storeNumber, setStoreNumber] = useState('');
  const [files, setFiles] = useState(null);
  const [dirLoading, setDirLoading] = useState(false);
  const [dirError, setDirError] = useState('');

  const [openTabs, setOpenTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [tabFiltersById, setTabFiltersById] = useState({});
  const [localContentByTabId, setLocalContentByTabId] = useState({});

  const [selectedFilenames, setSelectedFilenames] = useState(new Set());
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [downloadSuccess, setDownloadSuccess] = useState('');
  const [downloadProgress, setDownloadProgress] = useState({ loaded: 0, total: 0, percent: null });

  const [dark, setDark] = useState(() => localStorage.getItem('theme') !== 'light');
  const tabStripRef = useRef(null);
  const activeTabRef = useRef(null);

  const activeTab = openTabs.find((tab) => tab.id === activeTabId) || null;
  const activeFilters = activeTabId
    ? (tabFiltersById[activeTabId] || createDefaultFilters())
    : createDefaultFilters();
  const activeLocalContent =
    activeTab && activeTab.source === 'local'
      ? (localContentByTabId[activeTab.id] || '')
      : '';
  const activeRemoteFile = activeTab && activeTab.source === 'remote' ? activeTab.file : null;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    if (!downloadSuccess) return undefined;
    const timer = setTimeout(() => setDownloadSuccess(''), 3000);
    return () => clearTimeout(timer);
  }, [downloadSuccess]);

  useEffect(() => {
    if (!activeTabRef.current || !tabStripRef.current) return;
    activeTabRef.current.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  }, [activeTabId]);

  const handleConnect = useCallback(async (number) => {
    setStoreNumber(number);
    setDirLoading(true);
    setDirError('');
    setDownloadError('');
    setDownloadProgress({ loaded: 0, total: 0, percent: null });

    setFiles(null);
    setSelectedFilenames(new Set());

    // Store reconnect closes every open tab by design.
    setOpenTabs([]);
    setActiveTabId(null);
    setTabFiltersById({});
    setLocalContentByTabId({});

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

  const openRemoteTab = useCallback((file) => {
    if (!storeNumber) return;

    const tabId = `remote:${storeNumber}:${file.name}`;

    setOpenTabs((prev) => {
      if (prev.some((tab) => tab.id === tabId)) return prev;
      return [
        ...prev,
        {
          id: tabId,
          source: 'remote',
          storeNumber,
          file,
          title: file.name,
        },
      ];
    });

    setActiveTabId(tabId);
    setTabFiltersById((prev) => {
      if (prev[tabId]) return prev;
      return { ...prev, [tabId]: createDefaultFilters() };
    });
  }, [storeNumber]);

  const handleImportFile = useCallback(async (file) => {
    if (!file) return;

    const tabId = `local:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

    try {
      const text = await file.text();
      const importedFile = {
        name: file.name,
        size: formatFileSize(file.size),
        lastModified: file.lastModified ? new Date(file.lastModified).toLocaleString() : '',
      };

      setLocalContentByTabId((prev) => ({ ...prev, [tabId]: text }));
      setOpenTabs((prev) => [
        ...prev,
        {
          id: tabId,
          source: 'local',
          file: importedFile,
          title: importedFile.name,
        },
      ]);
      setActiveTabId(tabId);
      setTabFiltersById((prev) => ({ ...prev, [tabId]: createDefaultFilters() }));
    } catch (err) {
      setDownloadError(err.message || 'Failed to import local file.');
    }
  }, []);

  const handleCloseTab = useCallback((tabId) => {
    setOpenTabs((prev) => {
      const index = prev.findIndex((tab) => tab.id === tabId);
      if (index === -1) return prev;

      const nextTabs = prev.filter((tab) => tab.id !== tabId);
      setActiveTabId((currentActive) => {
        if (currentActive !== tabId) return currentActive;
        if (nextTabs.length === 0) return null;
        const nextIndex = Math.min(index, nextTabs.length - 1);
        return nextTabs[nextIndex].id;
      });

      return nextTabs;
    });

    setTabFiltersById((prev) => {
      if (!prev[tabId]) return prev;
      const next = { ...prev };
      delete next[tabId];
      return next;
    });

    setLocalContentByTabId((prev) => {
      if (!prev[tabId]) return prev;
      const next = { ...prev };
      delete next[tabId];
      return next;
    });
  }, []);

  const closeActiveTab = useCallback(() => {
    if (!activeTabId) return;
    handleCloseTab(activeTabId);
  }, [activeTabId, handleCloseTab]);

  const activateAdjacentTab = useCallback((direction) => {
    if (!openTabs.length || !activeTabId) return;
    const currentIndex = openTabs.findIndex((tab) => tab.id === activeTabId);
    if (currentIndex === -1) return;
    const nextIndex = (currentIndex + direction + openTabs.length) % openTabs.length;
    setActiveTabId(openTabs[nextIndex].id);
  }, [openTabs, activeTabId]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const key = event.key.toLowerCase();
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;

      if (key === 'w' && activeTabId) {
        event.preventDefault();
        event.stopPropagation();
        closeActiveTab();
        return;
      }

      if (event.key === 'Tab' && openTabs.length > 1 && activeTabId) {
        event.preventDefault();
        event.stopPropagation();
        activateAdjacentTab(event.shiftKey ? -1 : 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTabId, openTabs.length, closeActiveTab, activateAdjacentTab]);

  const handleToggleFileSelection = useCallback((filename) => {
    setSelectedFilenames((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) {
        next.delete(filename);
      } else {
        next.add(filename);
      }
      return next;
    });
  }, []);

  const handleSelectAllFiles = useCallback(() => {
    if (!files || files.length === 0) return;
    setSelectedFilenames(new Set(files.map((f) => f.name)));
  }, [files]);

  const handleClearAllFiles = useCallback(() => {
    setSelectedFilenames(new Set());
  }, []);

  const handleDownloadSelected = useCallback(async () => {
    if (!storeNumber || selectedFilenames.size === 0 || downloadLoading) return;

    setDownloadLoading(true);
    setDownloadError('');
    setDownloadSuccess('');
    setDownloadProgress({ loaded: 0, total: 0, percent: null });
    try {
      await downloadLogsZip(storeNumber, [...selectedFilenames], (progress) => {
        setDownloadProgress(progress);
      });
      setDownloadSuccess('ZIP download started.');
    } catch (err) {
      setDownloadError(err.message || 'Failed to download ZIP archive.');
    } finally {
      setDownloadLoading(false);
    }
  }, [storeNumber, selectedFilenames, downloadLoading]);

  const handleActiveFiltersChange = useCallback((nextFilters) => {
    if (!activeTabId) return;
    setTabFiltersById((prev) => ({ ...prev, [activeTabId]: nextFilters }));
  }, [activeTabId]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <header className="bg-gray-50 border-b border-gray-200 dark:bg-gray-900 dark:border-gray-700 px-5 py-3 flex items-center gap-4 shrink-0">
        <div className="flex items-center gap-2">
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

      {downloadSuccess && (
        <div className="absolute right-5 top-16 z-20 rounded border border-green-300 bg-green-50 px-3 py-2 text-xs text-green-800 shadow dark:border-green-700 dark:bg-green-900/30 dark:text-green-200">
          {downloadSuccess}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="w-72 shrink-0 flex flex-col border-r border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
          <StoreSelector
            onConnect={handleConnect}
            onImportFile={handleImportFile}
            disabled={dirLoading}
          />
          <LogFileList
            files={files}
            selectedFile={activeRemoteFile}
            selectedFilenames={selectedFilenames}
            onSelect={openRemoteTab}
            onToggleSelection={handleToggleFileSelection}
            onSelectAll={handleSelectAllFiles}
            onClearAll={handleClearAllFiles}
            onDownloadSelected={handleDownloadSelected}
            downloading={downloadLoading}
            downloadProgress={downloadProgress}
            downloadError={downloadError}
            loading={dirLoading}
            error={dirError}
          />
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col min-w-0">
          {openTabs.length > 0 && (
            <div className="border-b border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-900">
              <div
                ref={tabStripRef}
                className="flex items-center gap-1 px-2 py-1 overflow-x-auto"
                onWheel={(e) => {
                  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
                  e.preventDefault();
                  e.currentTarget.scrollLeft += e.deltaY;
                }}
              >
                {openTabs.map((tab) => {
                  const active = tab.id === activeTabId;
                  return (
                    <div
                      key={tab.id}
                      ref={active ? activeTabRef : null}
                      className={`group flex items-center min-w-0 max-w-xs rounded border text-xs transition-colors ${
                        tab.source === 'local'
                          ? active
                            ? 'bg-amber-50 border-amber-500 text-amber-900 shadow-sm dark:bg-amber-900/25 dark:border-amber-400 dark:text-amber-100'
                            : 'bg-amber-50/60 border-amber-200 text-amber-700 dark:bg-amber-900/10 dark:border-amber-800 dark:text-amber-300 hover:border-amber-300 dark:hover:border-amber-700'
                          : active
                            ? 'bg-sky-50 border-sky-500 text-sky-900 shadow-sm dark:bg-sky-900/25 dark:border-sky-400 dark:text-sky-100'
                            : 'bg-sky-50/60 border-sky-200 text-sky-700 dark:bg-sky-900/10 dark:border-sky-800 dark:text-sky-300 hover:border-sky-300 dark:hover:border-sky-700'
                      }`}
                      onMouseDown={(e) => {
                        if (e.button !== 1) return;
                        e.preventDefault();
                        handleCloseTab(tab.id);
                      }}
                    >
                      <button
                        onClick={() => setActiveTabId(tab.id)}
                        className="flex items-center px-2 py-1 truncate text-left"
                        title={tab.title}
                      >
                        <span className={`truncate ${active ? 'font-semibold' : ''}`}>{tab.title}</span>
                      </button>
                      <button
                        onClick={() => handleCloseTab(tab.id)}
                        className={`px-1.5 py-1 transition-colors ${
                          active
                            ? 'text-gray-500 hover:text-red-500 dark:text-gray-300 dark:hover:text-red-400'
                            : 'text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400'
                        }`}
                        title="Close tab"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="px-3 pb-1 text-[10px] text-gray-500 dark:text-gray-400 select-none">
                Shortcuts: Ctrl/Cmd+Tab next tab, Ctrl/Cmd+Shift+Tab previous tab, Ctrl/Cmd+W close tab
              </div>
            </div>
          )}

          {activeTab ? (
            <>
              <FilterPanel filters={activeFilters} onChange={handleActiveFiltersChange} />
              <LogViewer
                storeNumber={activeTab.source === 'remote' ? activeTab.storeNumber : ''}
                file={activeTab.file}
                fileSource={activeTab.source}
                localContent={activeLocalContent}
                filters={activeFilters}
              />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-600 dark:text-gray-500 gap-3 select-none">
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
              <p className="text-sm text-center px-4">
                Connect to a store and open a file, or import a local log file.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
