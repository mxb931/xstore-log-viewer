export default function ExportButton({ lines, filename, disabled }) {
  function handleExport() {
    if (!lines || lines.length === 0) return;

    const content = lines.join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${timestamp}.log`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();

    // Clean up
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  return (
    <button
      onClick={handleExport}
      disabled={disabled}
      title={disabled ? 'No lines to export' : 'Export displayed lines as .log file'}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold
                 bg-green-700 hover:bg-green-600 text-white transition-colors
                 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="w-3.5 h-3.5"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
          clipRule="evenodd"
        />
      </svg>
      Export
    </button>
  );
}
