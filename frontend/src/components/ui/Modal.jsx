import { X } from 'lucide-react';
import { useEffect } from 'react';

export default function Modal({ open, onClose, title, children, wide = false }) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div
        className={`
          relative bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl w-full
          ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}
          max-h-[90vh] overflow-y-auto shadow-xl
          animate-in slide-in-from-bottom sm:slide-in-from-bottom-0
        `}
      >
        <div className="sticky top-0 bg-white dark:bg-gray-800 flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700 rounded-t-2xl">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
