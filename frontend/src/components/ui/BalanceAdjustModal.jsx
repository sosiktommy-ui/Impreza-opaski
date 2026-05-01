import { useEffect, useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import { balancesApi } from '../../api/balances';

const COLORS = [
  { value: 'BLACK', label: 'Чёрные', dot: 'bg-zinc-800 dark:bg-zinc-200' },
  { value: 'WHITE', label: 'Белые', dot: 'bg-white border border-edge' },
  { value: 'RED',   label: 'Красные', dot: 'bg-red-500' },
  { value: 'BLUE',  label: 'Синие', dot: 'bg-blue-500' },
];

/** Manual personal-balance correction modal. ADMIN/OFFICE only. */
export default function BalanceAdjustModal({ open, onClose, user, onSuccess }) {
  const [color, setColor] = useState('BLACK');
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [balance, setBalance] = useState(null);

  useEffect(() => {
    if (!open || !user?.id) return;
    setColor('BLACK');
    setDelta('');
    setReason('');
    setError('');
    setBalance(null);
    let cancelled = false;
    balancesApi.getForUser(user.id)
      .then(({ data }) => { if (!cancelled) setBalance(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, user?.id]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const num = parseInt(delta, 10);
    if (!Number.isFinite(num) || num === 0) {
      setError('Введите ненулевое целое число');
      return;
    }
    if (!reason.trim() || reason.trim().length < 3) {
      setError('Опишите причину (минимум 3 символа)');
      return;
    }
    setLoading(true);
    try {
      await balancesApi.adjust({
        userId: user.id,
        color,
        delta: num,
        reason: reason.trim(),
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;
  const currentValue = balance ? balance[color.toLowerCase()] : null;

  return (
    <Modal open={open} onClose={onClose} title={`Корректировка баланса — ${user.displayName || user.username}`}>
      <form onSubmit={submit} className="space-y-4">
        {balance && (
          <div className="grid grid-cols-4 gap-2 p-3 rounded-[var(--radius-sm)] bg-surface-card border border-edge text-center">
            {COLORS.map((c) => (
              <div key={c.value}>
                <div className="flex items-center justify-center gap-1.5 text-xs text-content-muted mb-0.5">
                  <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                  {c.label}
                </div>
                <div className="text-base font-bold text-content-primary tabular-nums">
                  {balance[c.value.toLowerCase()] ?? 0}
                </div>
              </div>
            ))}
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-content-muted block mb-1.5">Цвет</label>
          <div className="grid grid-cols-4 gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setColor(c.value)}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-[var(--radius-sm)] border text-xs font-medium transition-colors ${
                  color === c.value
                    ? 'border-brand-500 bg-brand-500/10 text-content-primary'
                    : 'border-edge bg-surface-card hover:bg-surface-card-hover text-content-muted'
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-content-muted block mb-1.5">
            Изменение (+/-){currentValue != null && ` · текущий: ${currentValue}`}
          </label>
          <input
            type="number"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            placeholder="например, -3 или +5"
            className="w-full px-3 py-2 rounded-[var(--radius-sm)] border border-edge bg-surface-input text-content-primary focus:outline-none focus:border-brand-500"
            required
          />
        </div>

        <div>
          <label className="text-xs font-medium text-content-muted block mb-1.5">Причина</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Например: ошибка инвентаризации, разовая выдача..."
            className="w-full px-3 py-2 rounded-[var(--radius-sm)] border border-edge bg-surface-input text-content-primary focus:outline-none focus:border-brand-500 resize-none"
            required
          />
        </div>

        {error && (
          <div className="px-3 py-2 rounded-[var(--radius-sm)] bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Отмена
          </Button>
          <Button type="submit" variant="primary" loading={loading}>
            Применить
          </Button>
        </div>
      </form>
    </Modal>
  );
}
