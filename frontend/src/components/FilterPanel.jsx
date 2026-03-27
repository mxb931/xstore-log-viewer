const LOG_LEVELS = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'];

export default function FilterPanel({ filters, onChange }) {
  function setField(field, value) {
    onChange({ ...filters, [field]: value });
  }

  function toggleLevel(level) {
    const current = new Set(filters.levels);
    if (current.has(level)) {
      current.delete(level);
    } else {
      current.add(level);
    }
    setField('levels', current);
  }

  function clearAll() {
    onChange({
      text: '',
      isRegex: false,
      levels: new Set(),
      dateFrom: '',
      dateTo: '',
    });
  }

  const hasActiveFilter =
    filters.text || filters.levels.size > 0 || filters.dateFrom || filters.dateTo;

  return (
    <div className="bg-gray-900 border-b border-gray-700 px-4 py-3 flex flex-wrap gap-4 items-end">
      {/* Text / Regex search */}
      <div className="flex flex-col gap-1 min-w-[220px] flex-1">
        <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Search
        </label>
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={filters.text}
            onChange={(e) => setField('text', e.target.value)}
            placeholder={filters.isRegex ? 'Enter regex…' : 'Keyword or phrase…'}
            className="flex-1 min-w-0 px-3 py-1.5 rounded bg-gray-800 border border-gray-600 text-gray-100
                       placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono text-xs"
          />
          <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none whitespace-nowrap">
            <input
              type="checkbox"
              checked={filters.isRegex}
              onChange={(e) => setField('isRegex', e.target.checked)}
              className="accent-blue-500"
            />
            Regex
          </label>
        </div>
        {filters.isRegex && filters.text && (() => {
          try {
            new RegExp(filters.text, 'i');
            return null;
          } catch {
            return <p className="text-xs text-red-400 mt-0.5">Invalid regex pattern</p>;
          }
        })()}
      </div>

      {/* Log level filter */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Log Level
        </label>
        <div className="flex gap-2 flex-wrap">
          {LOG_LEVELS.map((level) => {
            const active = filters.levels.has(level);
            const colors = {
              ERROR: 'bg-red-700 border-red-600 text-red-100',
              WARN: 'bg-yellow-700 border-yellow-600 text-yellow-100',
              INFO: 'bg-blue-700 border-blue-600 text-blue-100',
              DEBUG: 'bg-green-800 border-green-700 text-green-100',
              TRACE: 'bg-gray-700 border-gray-600 text-gray-300',
            };
            return (
              <button
                key={level}
                onClick={() => toggleLevel(level)}
                className={`px-2.5 py-1 rounded text-xs font-bold border transition-all
                  ${active ? colors[level] : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-400'}`}
              >
                {level}
              </button>
            );
          })}
        </div>
      </div>

      {/* Date range */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Date Range
        </label>
        <div className="flex gap-2 items-center">
          <input
            type="datetime-local"
            value={filters.dateFrom}
            onChange={(e) => setField('dateFrom', e.target.value)}
            className="px-2 py-1.5 rounded bg-gray-800 border border-gray-600 text-gray-100
                       focus:outline-none focus:border-blue-500 text-xs"
          />
          <span className="text-gray-500 text-xs">to</span>
          <input
            type="datetime-local"
            value={filters.dateTo}
            onChange={(e) => setField('dateTo', e.target.value)}
            className="px-2 py-1.5 rounded bg-gray-800 border border-gray-600 text-gray-100
                       focus:outline-none focus:border-blue-500 text-xs"
          />
        </div>
      </div>

      {/* Clear filters */}
      {hasActiveFilter && (
        <button
          onClick={clearAll}
          className="self-end px-3 py-1.5 rounded text-xs text-gray-400 border border-gray-600
                     hover:border-gray-400 hover:text-gray-200 transition-colors"
        >
          Clear Filters
        </button>
      )}
    </div>
  );
}
