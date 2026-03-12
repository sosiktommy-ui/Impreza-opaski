import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Pagination({ page, totalPages, onPageChange }) {
  if (!totalPages || totalPages <= 1) return null;

  const pages = [];
  const maxVisible = 5;
  let start = Math.max(1, page - Math.floor(maxVisible / 2));
  let end = Math.min(totalPages, start + maxVisible - 1);
  if (end - start < maxVisible - 1) {
    start = Math.max(1, end - maxVisible + 1);
  }

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  return (
    <div className="flex items-center justify-center gap-1 mt-4">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="p-1.5 rounded-[var(--radius-sm)] hover:bg-surface-card-hover text-content-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft size={18} />
      </button>

      {start > 1 && (
        <>
          <button
            onClick={() => onPageChange(1)}
            className="w-8 h-8 rounded-[var(--radius-sm)] text-sm font-medium text-content-secondary hover:bg-surface-card-hover transition-colors"
          >
            1
          </button>
          {start > 2 && <span className="text-content-muted text-xs px-1">…</span>}
        </>
      )}

      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onPageChange(p)}
          className={`w-8 h-8 rounded-[var(--radius-sm)] text-sm font-medium transition-colors ${
            p === page
              ? 'bg-brand-600 text-white shadow-sm'
              : 'text-content-secondary hover:bg-surface-card-hover'
          }`}
        >
          {p}
        </button>
      ))}

      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span className="text-content-muted text-xs px-1">…</span>}
          <button
            onClick={() => onPageChange(totalPages)}
            className="w-8 h-8 rounded-[var(--radius-sm)] text-sm font-medium text-content-secondary hover:bg-surface-card-hover transition-colors"
          >
            {totalPages}
          </button>
        </>
      )}

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="p-1.5 rounded-[var(--radius-sm)] hover:bg-surface-card-hover text-content-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
