export default function LogFileList({ files, selectedFile, onSelect, loading, error }) {
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 text-gray-400 text-xs animate-pulse">
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
      <div className="flex-1 p-4 text-gray-500 text-xs text-center mt-8">
        Enter a store number above and click Connect to browse log files.
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex-1 p-4 text-gray-400 text-xs text-center mt-8">
        No log files found in /shw-logs/ for this store.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <ul>
        {files.map((file) => {
          const isSelected = selectedFile?.name === file.name;
          return (
            <li key={file.name}>
              <button
                onClick={() => onSelect(file)}
                className={`w-full text-left px-4 py-2 border-b border-gray-800 hover:bg-gray-800 transition-colors
                  ${isSelected ? 'bg-blue-900/40 border-l-2 border-l-blue-500' : 'border-l-2 border-l-transparent'}`}
              >
                <p className="truncate text-xs font-mono text-gray-200">{file.name}</p>
                <div className="flex gap-3 mt-0.5 text-gray-500" style={{ fontSize: '10px' }}>
                  {file.lastModified && <span>{file.lastModified}</span>}
                  {file.size && <span>{file.size}</span>}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
