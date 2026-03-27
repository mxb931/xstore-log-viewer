import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { FixedSizeList as List } from 'react-window';
import { fetchLogFile } from '../services/api';
import ExportButton from './ExportButton';

// Matches common log level tokens in a line (case-insensitive)
const LEVEL_PATTERN = /\b(ERROR|WARN(?:ING)?|INFO|DEBUG|TRACE)\b/i;

// Normalize detected level to one of our canonical labels
function detectLevel(line) {
  const m = line.match(LEVEL_PATTERN);
  if (!m) return null;
  const raw = m[1].toUpperCase();
  if (raw === 'WARNING') return 'WARN';
  return raw;
}

// Parse an ISO-ish or common log timestamp from the beginning of a line.
// Returns a Date or null.
function parseLineDate(line) {
  // ISO 8601: 2025-03-27T14:55:00 or 2025-03-27 14:55:00
  const iso = line.match(/^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})/);
  if (iso) return new Date(iso[1].replace(' ', 'T'));
  return null;
}

// Color classes by log level for the line highlight
const LEVEL_COLORS = {
  ERROR: 'text-red-400',
  WARN: 'text-yellow-300',
  INFO: 'text-blue-300',
  DEBUG: 'text-green-400',
  TRACE: 'text-gray-400',
};

function HighlightedLine({ text, pattern }) {
  if (!pattern) return <span>{text}</span>;

  try {
    const regex = new RegExp(`(${pattern})`, 'gi');
    const parts = text.split(regex);
    return (
      <>
        {parts.map((part, i) =>
          regex.test(part) ? (
            <mark key={i} className="bg-yellow-400 text-gray-900 rounded-sm px-0.5">
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </>
    );
  } catch {
    return <span>{text}</span>;
  }
}

export default function LogViewer({ storeNumber, file, filters }) {
  const [allLines, setAllLines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const containerRef = useRef(null);
  const [listHeight, setListHeight] = useState(500);

  // Resize observer to fill available vertical space
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setListHeight(entry.contentRect.height);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Load file whenever storeNumber or file changes
  useEffect(() => {
    if (!storeNumber || !file) return;

    setLoading(true);
    setError('');
    setAllLines([]);

    fetchLogFile(storeNumber, file.name)
      .then((text) => {
        setAllLines(text.split('\n'));
      })
      .catch((err) => {
        const msg =
          err.response?.data?.error ||
          err.response?.data ||
          err.message ||
          'Failed to load log file.';
        setError(String(msg));
      })
      .finally(() => setLoading(false));
  }, [storeNumber, file]);

  // Compute regex or plain-text match function from filters
  const matchFn = useMemo(() => {
    const { text, isRegex } = filters;
    if (!text) return null;
    if (isRegex) {
      try {
        const re = new RegExp(text, 'i');
        return (line) => re.test(line);
      } catch {
        return null; // invalid regex — don't filter
      }
    }
    const lower = text.toLowerCase();
    return (line) => line.toLowerCase().includes(lower);
  }, [filters.text, filters.isRegex]);

  // Parsed date range limits
  const dateFrom = useMemo(
    () => (filters.dateFrom ? new Date(filters.dateFrom) : null),
    [filters.dateFrom]
  );
  const dateTo = useMemo(
    () => (filters.dateTo ? new Date(filters.dateTo) : null),
    [filters.dateTo]
  );

  // Filtered lines (with original 0-based index for line numbers)
  const filteredLines = useMemo(() => {
    if (!allLines.length) return [];

    return allLines.reduce((acc, line, idx) => {
      // Text / regex filter
      if (matchFn && !matchFn(line)) return acc;

      // Level filter
      if (filters.levels.size > 0) {
        const level = detectLevel(line);
        if (!level || !filters.levels.has(level)) return acc;
      }

      // Date range filter
      if (dateFrom || dateTo) {
        const lineDate = parseLineDate(line);
        if (!lineDate) return acc; // exclude lines without a parseable date
        if (dateFrom && lineDate < dateFrom) return acc;
        if (dateTo && lineDate > dateTo) return acc;
      }

      acc.push({ line, index: idx });
      return acc;
    }, []);
  }, [allLines, matchFn, filters.levels, dateFrom, dateTo]);

  // Highlight pattern for text matches
  const highlightPattern = useMemo(() => {
    if (!filters.text) return null;
    if (filters.isRegex) return filters.text;
    // Escape for use as a literal pattern inside a regex
    return filters.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }, [filters.text, filters.isRegex]);

  const isFiltered =
    filters.text || filters.levels.size > 0 || filters.dateFrom || filters.dateTo;

  const renderRow = useCallback(
    ({ index, style }) => {
      const { line, index: lineNumber } = filteredLines[index];
      const level = detectLevel(line);
      const levelColor = level ? LEVEL_COLORS[level] : 'text-gray-300';

      return (
        <div
          style={style}
          className={`flex min-w-0 hover:bg-white/5 px-3 ${levelColor}`}
        >
          <span
            className="select-none text-gray-600 mr-4 text-right shrink-0"
            style={{ width: '5ch' }}
          >
            {lineNumber + 1}
          </span>
          <span className="font-mono text-xs whitespace-pre leading-5 ">
            <HighlightedLine text={line} pattern={highlightPattern} />
          </span>
        </div>
      );
    },
    [filteredLines, highlightPattern]
  );

  if (!file) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
        Select a log file from the sidebar.
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-xs text-gray-300 truncate">{file.name}</span>
          {!loading && (
            <span className="text-xs text-gray-500">
              {isFiltered
                ? `${filteredLines.length.toLocaleString()} / ${allLines.length.toLocaleString()} lines`
                : `${allLines.length.toLocaleString()} lines`}
            </span>
          )}
        </div>
        <ExportButton
          lines={filteredLines.map((f) => f.line)}
          filename={`${storeNumber}_${file.name}`}
          disabled={loading || filteredLines.length === 0}
        />
      </div>

      {/* Content */}
      <div ref={containerRef} className="flex-1 min-h-0 bg-gray-950">
        {loading && (
          <div className="flex items-center justify-center h-full text-gray-400 text-xs animate-pulse">
            Loading {file.name}…
          </div>
        )}
        {error && !loading && (
          <div className="flex items-center justify-center h-full text-red-400 text-xs p-4 text-center">
            {error}
          </div>
        )}
        {!loading && !error && filteredLines.length === 0 && allLines.length > 0 && (
          <div className="flex items-center justify-center h-full text-gray-500 text-xs">
            No lines match the current filters.
          </div>
        )}
        {!loading && !error && filteredLines.length > 0 && (
          <List
            height={listHeight}
            itemCount={filteredLines.length}
            itemSize={20}
            width="100%"
          >
            {renderRow}
          </List>
        )}
      </div>
    </div>
  );
}
