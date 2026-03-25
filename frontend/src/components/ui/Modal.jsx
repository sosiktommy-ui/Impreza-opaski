import { X, Eye, EyeOff, AlertTriangle, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function Modal({ open, isOpen, onClose, title, children, wide = false }) {
  const visible = open ?? isOpen;
  useEffect(() => {
    if (visible) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible, onClose]);

  if (!visible) return null;

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

// ─────────────────────────────────────────────────────────────────────────────
// TwoFactorModal — Confirmation modal with password re-entry for dangerous actions
// ─────────────────────────────────────────────────────────────────────────────
export function TwoFactorModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Подтверждение действия',
  description,
  consequences = [],
  confirmButtonText = 'Подтвердить',
  confirmButtonVariant = 'danger', // 'danger' | 'warning' | 'primary'
  isLoading = false,
}) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setPassword('');
      setError('');
      setShowPassword(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('Введите пароль');
      return;
    }
    setError('');
    try {
      await onConfirm(password);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Неверный пароль');
    }
  };

  const buttonColors = {
    danger: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
    warning: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500',
    primary: 'bg-brand-600 hover:bg-brand-700 focus:ring-brand-500',
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center animate-fadeIn">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface-elevated rounded-t-[var(--radius-lg)] sm:rounded-[var(--radius-lg)] w-full sm:max-w-md max-h-[90vh] overflow-y-auto shadow-lg animate-scaleIn">
        {/* Header */}
        <div className="sticky top-0 bg-surface-elevated flex items-center gap-3 px-5 py-4 border-b border-edge rounded-t-[var(--radius-lg)] z-10">
          <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="text-amber-500" size={20} />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-content-primary">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-[var(--radius-sm)] hover:bg-surface-card-hover text-content-muted hover:text-content-primary transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Description */}
          {description && (
            <p className="text-sm text-content-secondary">{description}</p>
          )}

          {/* Consequences */}
          {consequences.length > 0 && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-[var(--radius-md)] p-4">
              <p className="text-sm font-medium text-amber-400 mb-2">Последствия:</p>
              <ul className="space-y-1.5">
                {consequences.map((c, i) => (
                  <li key={i} className="text-sm text-content-secondary flex items-start gap-2">
                    <span className="text-amber-500 mt-1">•</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Password Input */}
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1.5">
              Для подтверждения введите пароль:
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ваш пароль"
                autoComplete="current-password"
                className="w-full px-3 py-2.5 pr-10 bg-surface-card border border-edge rounded-[var(--radius-sm)] text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-primary transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-500 bg-red-500/10 rounded-[var(--radius-sm)] px-3 py-2">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 px-4 py-2.5 border border-edge rounded-[var(--radius-sm)] text-content-secondary hover:bg-surface-card-hover transition-colors font-medium"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isLoading || !password.trim()}
              className={`flex-1 px-4 py-2.5 rounded-[var(--radius-sm)] text-white font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface-elevated disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${buttonColors[confirmButtonVariant]}`}
            >
              {isLoading && <Loader2 size={16} className="animate-spin" />}
              {confirmButtonText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
