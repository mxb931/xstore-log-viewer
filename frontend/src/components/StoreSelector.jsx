import { useRef, useState } from 'react';

export default function StoreSelector({ onConnect, onImportFile, disabled }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!/^[A-Za-z0-9-]{1,32}$/.test(trimmed)) {
      setError('Store ID must be alphanumeric (letters/numbers, optional hyphen).');
      return;
    }
    setError('');
    onConnect(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 border-b border-gray-200 dark:border-gray-700">
      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-2">
        Store Number
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError('');
          }}
          placeholder="e.g. 701244 or lb5000"
          disabled={disabled}
          className="flex-1 min-w-0 px-3 py-2 rounded bg-white border border-gray-300 text-gray-900
                     placeholder-gray-400 focus:outline-none focus:border-blue-500 disabled:opacity-50
                     dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-500"
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 font-semibold
                     disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Connect
        </button>
      </div>
      <div className="mt-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".log,.txt,.out,.csv,.json,text/plain"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && onImportFile) {
              onImportFile(file);
            }
            e.target.value = '';
          }}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
          className="w-full px-4 py-2 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Import Local File
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </form>
  );
}
