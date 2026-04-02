import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { FixedSizeList as List } from 'react-window';
import { fetchLogFileChunk } from '../services/api';
import ExportButton from './ExportButton';

const REMOTE_LINE_CHUNK = 2000;

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
  ERROR: 'text-red-600 dark:text-red-400',
  WARN: 'text-yellow-600 dark:text-yellow-300',
  INFO: 'text-blue-600 dark:text-blue-300',
  DEBUG: 'text-green-600 dark:text-green-400',
  TRACE: 'text-gray-500 dark:text-gray-400',
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

export default function LogViewer({ storeNumber, file, fileSource = 'remote', localContent = '', filters }) {
  // ── State ─────────────────────────────────────────────────────────────────
  const [allLines, setAllLines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reversed, setReversed] = useState(true);
  const [listHeight, setListHeight] = useState(500);
  const [remoteChunkMeta, setRemoteChunkMeta] = useState({
    mode: 'tail',
    lineLimit: REMOTE_LINE_CHUNK,
    truncated: false,
  });

  const containerRef = useRef(null);
  const requestIdRef = useRef(0);

  // ── Memos (declared before effects that depend on them) ───────────────────
  const matchFn = useMemo(() => {
    const { text, isRegex } = filters;
    if (!text) return null;
    if (isRegex) {
      try {
        const re = new RegExp(text, 'i');
        return (line) => re.test(line);
      } catch {
        return null;
      }
    }
    const lower = text.toLowerCase();
    return (line) => line.toLowerCase().includes(lower);
  }, [filters.text, filters.isRegex]);

  const dateFrom = useMemo(
    () => (filters.dateFrom ? new Date(filters.dateFrom) : null),
    [filters.dateFrom]
  );
  const dateTo = useMemo(
    () => (filters.dateTo ? new Date(filters.dateTo) : null),
    [filters.dateTo]
  );

  const filteredLines = useMemo(() => {
    if (!allLines.length) return [];
    return allLines.reduce((acc, line, idx) => {
      if (matchFn && !matchFn(line)) return acc;
      if (filters.levels.size > 0) {
        const level = detectLevel(line);
        if (!level || !filters.levels.has(level)) return acc;
      }
      if (dateFrom || dateTo) {
        const lineDate = parseLineDate(line);
        if (!lineDate) return acc;
        if (dateFrom && lineDate < dateFrom) return acc;
        if (dateTo && lineDate > dateTo) return acc;
      }
      acc.push({ line, index: idx });
      return acc;
    }, []);
  }, [allLines, matchFn, filters.levels, dateFrom, dateTo]);

  const highlightPattern = useMemo(() => {
    if (!filters.text) return null;
    if (filters.isRegex) return filters.text;
    return filters.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }, [filters.text, filters.isRegex]);

  // Reversed view — newest lines at top
  const displayLines = useMemo(
    () => (reversed ? [...filteredLines].reverse() : filteredLines),
    [filteredLines, reversed]
  );

  // ── Effects ───────────────────────────────────────────────────────────────

  // Resize observer to fill available vertical space
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setListHeight(entry.contentRect.height);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Load file whenever storeNumber or file changes
  useEffect(() => {
    if (!file) return;

    if (fileSource === 'local') {
      setLoading(false);
      setError('');
      setAllLines(localContent ? localContent.split('\n') : []);
      setRemoteChunkMeta({
        mode: 'tail',
        lineLimit: REMOTE_LINE_CHUNK,
        truncated: false,
      });
      return;
    }

    if (!storeNumber) return;

    setLoading(true);
    setError('');
    setAllLines([]);
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const mode = reversed ? 'tail' : 'head';

    fetchLogFileChunk(storeNumber, file.name, { mode, lines: REMOTE_LINE_CHUNK })
      .then((payload) => {
        if (requestId !== requestIdRef.current) return;
        setAllLines(Array.isArray(payload?.lines) ? payload.lines : []);
        setRemoteChunkMeta({
          mode: payload?.mode === 'head' ? 'head' : 'tail',
          lineLimit: Number.isFinite(payload?.lineLimit) ? payload.lineLimit : REMOTE_LINE_CHUNK,
          truncated: Boolean(payload?.truncated),
        });
      })
      .catch((err) => {
        if (requestId !== requestIdRef.current) return;
        const msg =
          err.response?.data?.error ||
          err.response?.data ||
          err.message ||
          'Failed to load log file.';
        setError(String(msg));
      })
      .finally(() => {
        if (requestId !== requestIdRef.current) return;
        setLoading(false);
      });
  }, [storeNumber, file, fileSource, localContent, reversed]);

  // ── Callbacks ─────────────────────────────────────────────────────────────

  const toggleReversed = useCallback(() => setReversed((prev) => !prev), []);

  const renderRow = useCallback(
    ({ index, style }) => {
      const { line, index: lineNumber } = displayLines[index];
      const level = detectLevel(line);
      const levelColor = level ? LEVEL_COLORS[level] : 'text-gray-700 dark:text-gray-300';
      return (
        <div style={style} className={`flex min-w-0 hover:bg-black/5 dark:hover:bg-white/5 px-3 ${levelColor}`}>
          <span
            className="select-none text-gray-600 mr-4 text-right shrink-0"
            style={{ width: '5ch' }}
          >
            {lineNumber + 1}
          </span>
          <span className="font-mono text-xs whitespace-pre leading-5">
            <HighlightedLine text={line} pattern={highlightPattern} />
          </span>
        </div>
      );
    },
    [displayLines, highlightPattern]
  );

  const isFiltered =
    filters.text || filters.levels.size > 0 || filters.dateFrom || filters.dateTo;

  const remoteSubsetLabel = useMemo(() => {
    if (fileSource !== 'remote') return '';
    const orientation = remoteChunkMeta.mode === 'head' ? 'oldest' : 'newest';
    if (!remoteChunkMeta.truncated) return `Loaded complete file (${orientation} scan)`;
    return `Showing ${orientation} ${remoteChunkMeta.lineLimit.toLocaleString()} lines for fast loading`;
  }, [fileSource, remoteChunkMeta.mode, remoteChunkMeta.truncated, remoteChunkMeta.lineLimit]);

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
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200 dark:bg-gray-900 dark:border-gray-700 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-xs text-gray-700 dark:text-gray-300 truncate">{file.name}</span>
          {!loading && (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-gray-500">
                {isFiltered
                  ? `${filteredLines.length.toLocaleString()} / ${allLines.length.toLocaleString()} lines`
                  : `${allLines.length.toLocaleString()} lines`}
              </span>
              {fileSource === 'remote' && (
                <span className="text-[11px] text-gray-400 truncate" title={remoteSubsetLabel}>
                  {remoteSubsetLabel}
                </span>
              )}
            </div>
          )}

          {/* Reverse order toggle */}
          <button
            onClick={toggleReversed}
            title={reversed ? 'Show oldest first' : 'Show newest first'}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs border transition-all ${
              reversed
                ? 'bg-gray-200 border-gray-500 text-gray-700 dark:bg-gray-700 dark:border-gray-400 dark:text-gray-200'
                : 'bg-white border-gray-300 text-gray-500 hover:border-gray-500 hover:text-gray-700 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400 dark:hover:border-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
              <path d="M3 3a1 1 0 000 2h11a1 1 0 100-2H3zM3 7a1 1 0 000 2h7a1 1 0 100-2H3zM3 11a1 1 0 100 2h4a1 1 0 100-2H3zM15 8a1 1 0 10-2 0v5.586l-1.293-1.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L15 13.586V8z" />
            </svg>
            {reversed ? 'Newest first' : 'Oldest first'}
          </button>
        </div>

        <ExportButton
          lines={displayLines.map((f) => f.line)}
          filename={fileSource === 'local' ? `imported_${file.name}` : `${storeNumber}_${file.name}`}
          disabled={loading || displayLines.length === 0}
        />
      </div>

      {/* Content */}
      <div ref={containerRef} className="flex-1 min-h-0 bg-white dark:bg-gray-950 relative">
        {loading && (
          <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 text-xs animate-pulse">
            Loading {reversed ? 'newest' : 'oldest'} lines from {file.name}…
          </div>
        )}
        {error && !loading && (
          <div className="flex items-center justify-center h-full text-red-400 text-xs p-4 text-center">
            {error}
          </div>
        )}
        {!loading && !error && displayLines.length === 0 && allLines.length > 0 && (
          <div className="flex items-center justify-center h-full text-gray-500 text-xs">
            No lines match the current filters.
          </div>
        )}
        {!loading && !error && displayLines.length > 0 && (
          <List
            height={listHeight}
            itemCount={displayLines.length}
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
