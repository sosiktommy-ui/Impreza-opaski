import { useEffect } from 'react';

export default function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = { sm: 'max-w-[360px]', md: 'max-w-[480px]', lg: 'max-w-[640px]' };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 fade-in"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className={`card w-full ${widths[size] || widths.md}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {title && (
          <div
            className="px-5 py-4 border-b flex items-center justify-between"
            style={{ borderColor: 'var(--border)' }}
          >
            <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
            <button onClick={onClose} className="btn btn-ghost btn-icon" aria-label="Закрыть">
              ×
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
        {footer && (
          <div
            className="px-5 py-4 border-t flex items-center justify-end gap-2"
            style={{ borderColor: 'var(--border)' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
