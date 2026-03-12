import { X } from 'lucide-react';
import { useEffect } from 'react';

export default function Modal({ open, onClose, title, children, wide = false }) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center animate-fadeIn">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`
          relative bg-surface-elevated rounded-t-[var(--radius-lg)] sm:rounded-[var(--radius-lg)] w-full
          ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}
          max-h-[90vh] overflow-y-auto shadow-lg
          animate-scaleIn
        `}
      >
        <div className="sticky top-0 bg-surface-elevated flex items-center justify-between px-5 py-4 border-b border-edge rounded-t-[var(--radius-lg)] z-10">
          <h2 className="text-lg font-semibold text-content-primary">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-[var(--radius-sm)] hover:bg-surface-card-hover text-content-muted hover:text-content-primary transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
