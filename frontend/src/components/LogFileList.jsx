import { useEffect, useRef, useState } from 'react';

export default function LogFileList({
  files,
  selectedFile,
  selectedFilenames,
  onSelect,
  onToggleSelection,
  onSelectAll,
  onClearAll,
  onDownloadSelected,
  downloading,
  downloadProgress,
  downloadError,
  loading,
  error,
}) {
  const selectAllRef = useRef(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  const selectedCount = files
    ? files.reduce((count, file) => count + (selectedFilenames.has(file.name) ? 1 : 0), 0)
    : 0;
  const allSelected = Boolean(files?.length) && selectedCount === files.length;
  const partiallySelected = selectedCount > 0 && !allSelected;

  const loadedBytes = Number(downloadProgress?.loaded || 0);
  const totalBytes = Number(downloadProgress?.total || 0);

  function formatBytes(bytes) {
    if (!bytes || bytes < 1024) return `${bytes || 0} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes / 1024;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unitIndex]}`;
  }

  function formatElapsed(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = partiallySelected;
    }
  }, [partiallySelected]);

  useEffect(() => {
    if (!downloading) {
      setElapsedSec(0);
      return undefined;
    }

    const startedAt = Date.now();
    const intervalId = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => clearInterval(intervalId);
  }, [downloading]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 text-gray-500 dark:text-gray-400 text-xs animate-pulse">
        Loading directory…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 p-4 text-red-400 text-xs">
        <p className="font-semibold mb-1">Connection failed</p>
        <p>{error}</p>
      </div>
    );
  }

  if (!files) {
    return (
      <div className="flex-1 p-4 text-gray-400 dark:text-gray-500 text-xs text-center mt-8">
        Enter a store number above and click Connect to browse log files.
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex-1 p-4 text-gray-500 dark:text-gray-400 text-xs text-center mt-8">
        No log files found in /shw-logs/ for this store.
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 select-none">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allSelected}
              onChange={(e) => {
                if (e.target.checked) {
                  onSelectAll();
                } else {
                  onClearAll();
                }
              }}
              className="rounded border-gray-400 text-blue-600 focus:ring-blue-500"
            />
            Select all
          </label>
          <span className="text-[11px] text-gray-500 dark:text-gray-400">
            {selectedCount} selected
          </span>
        </div>

        <button
          onClick={onDownloadSelected}
          disabled={selectedCount === 0 || downloading}
          className="mt-2 w-full px-3 py-1.5 rounded text-xs font-semibold bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={selectedCount === 0 ? 'Select at least one file to download' : 'Download selected files as ZIP'}
        >
          {downloading ? 'Preparing ZIP…' : 'Download'}
        </button>

        {downloading && (
          <div className="mt-2 rounded border border-blue-200 bg-blue-50 px-2 py-1.5 dark:border-blue-800 dark:bg-blue-900/20">
            <p className="mt-1 text-[11px] text-blue-700 dark:text-blue-300">
              {totalBytes > 0
                ? `Downloading ZIP... ${formatBytes(loadedBytes)} / ${formatBytes(totalBytes)}`
                : `Downloading ZIP... ${formatBytes(loadedBytes)} received`}
            </p>
            <p className="mt-0.5 text-[11px] text-blue-600 dark:text-blue-400">
              Elapsed: {formatElapsed(elapsedSec)}
            </p>
          </div>
        )}

        {downloadError && (
          <p className="mt-1 text-[11px] text-red-500 dark:text-red-400 break-words">
            {downloadError}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <ul>
          {files.map((file) => {
            const isViewerSelected = selectedFile?.name === file.name;
            const isChecked = selectedFilenames.has(file.name);

            return (
              <li key={file.name} className="border-b border-gray-100 dark:border-gray-800">
                <div
                  className={`flex items-start gap-2 px-2 py-2 transition-colors ${
                    isViewerSelected
                      ? 'bg-blue-50 dark:bg-blue-900/40'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => onToggleSelection(file.name)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 rounded border-gray-400 text-blue-600 focus:ring-blue-500"
                    aria-label={`Select ${file.name}`}
                  />

                  <button
                    onClick={() => onSelect(file)}
                    className="flex-1 min-w-0 text-left"
                    title={`Open ${file.name}`}
                  >
                    <p className="truncate text-xs font-mono text-gray-800 dark:text-gray-200">
                      {file.name}
                    </p>
                    <div className="flex gap-3 mt-0.5 text-gray-500 dark:text-gray-400" style={{ fontSize: '10px' }}>
                      {file.lastModified && <span>{file.lastModified}</span>}
                      {file.size && <span>{file.size}</span>}
                    </div>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
