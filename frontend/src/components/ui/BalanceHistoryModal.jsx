import { useEffect, useState } from 'react';
import Modal from './Modal';
import { balancesApi } from '../../api/balances';
import {
  TrendingUp, TrendingDown, Sliders, RotateCcw, History as HistoryIcon,
} from 'lucide-react';

const COLOR_LABEL = { BLACK: 'Чёрные', WHITE: 'Белые', RED: 'Красные', BLUE: 'Синие' };
const COLOR_DOT = {
  BLACK: 'bg-zinc-800 dark:bg-zinc-200',
  WHITE: 'bg-white border border-edge',
  RED: 'bg-red-500',
  BLUE: 'bg-blue-500',
};

const ACTION_META = {
  BALANCE_ADJUSTED: { icon: Sliders, label: 'Корректировка', tone: 'text-amber-500 bg-amber-500/10' },
  EXPENSE_CREATED:  { icon: TrendingDown, label: 'Расход',     tone: 'text-red-500 bg-red-500/10' },
  EXPENSE_DELETED:  { icon: RotateCcw,    label: 'Возврат расхода', tone: 'text-emerald-500 bg-emerald-500/10' },
};

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

function renderMeta(action, meta) {
  if (!meta || typeof meta !== 'object') return null;
  if (action === 'BALANCE_ADJUSTED') {
    const sign = (meta.delta ?? 0) > 0 ? '+' : '';
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className={`w-2.5 h-2.5 rounded-full ${COLOR_DOT[meta.color] || ''}`} />
        <span className="text-content-secondary">{COLOR_LABEL[meta.color] || meta.color}</span>
        <span className="font-semibold text-content-primary tabular-nums">{sign}{meta.delta}</span>
        {typeof meta.before === 'number' && typeof meta.after === 'number' && (
          <span className="text-content-muted">({meta.before} → {meta.after})</span>
        )}
        {meta.reason && <span className="text-content-muted italic truncate">— {meta.reason}</span>}
      </div>
    );
  }
  if (action === 'EXPENSE_CREATED' || action === 'EXPENSE_DELETED') {
    const sign = action === 'EXPENSE_CREATED' ? '−' : '+';
    const colors = ['BLACK', 'WHITE', 'RED', 'BLUE'].filter((c) => meta[c.toLowerCase()] > 0);
    return (
      <div className="space-y-1">
        {meta.eventName && <div className="text-xs text-content-secondary">{meta.eventName}</div>}
        {colors.length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            {colors.map((c) => (
              <span key={c} className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${COLOR_DOT[c]}`} />
                <span className="tabular-nums">{sign}{meta[c.toLowerCase()]}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }
  return null;
}

/**
 * Timeline of balance-affecting events for a user.
 * Props:
 *   - open: boolean
 *   - onClose: () => void
 *   - userId?: string  (omit → use /me/history; provide → /users/:userId/history)
 *   - title?: string
 */
export default function BalanceHistoryModal({ open, onClose, userId, title }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    const fetcher = userId
      ? balancesApi.getUserHistory(userId, { limit: 100 })
      : balancesApi.getMyHistory({ limit: 100 });
    fetcher
      .then(({ data }) => {
        if (cancelled) return;
        const list = data?.data ?? data ?? [];
        setItems(Array.isArray(list) ? list : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.response?.data?.message || 'Не удалось загрузить историю');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, userId]);

  return (
    <Modal open={open} onClose={onClose} title={title || 'История баланса'} wide>
      {loading && (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin h-6 w-6 border-4 border-brand-200 border-t-brand-600 rounded-full" />
        </div>
      )}
      {!loading && error && (
        <div className="bg-red-500/10 text-red-400 text-sm px-3 py-2 rounded-[var(--radius-sm)]">{error}</div>
      )}
      {!loading && !error && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-content-muted">
          <HistoryIcon size={32} className="mb-2 opacity-50" />
          <span className="text-sm">Событий пока нет</span>
        </div>
      )}
      {!loading && !error && items.length > 0 && (
        <ul className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {items.map((ev) => {
            const meta = ACTION_META[ev.action] || { icon: HistoryIcon, label: ev.action, tone: 'text-content-muted bg-surface-secondary' };
            const Icon = meta.icon;
            return (
              <li
                key={ev.id}
                className="flex items-start gap-3 p-3 rounded-[var(--radius-sm)] border border-edge bg-surface-card"
              >
                <div className={`flex-shrink-0 w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center ${meta.tone}`}>
                  <Icon size={16} />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-content-primary">{meta.label}</span>
                    <span className="text-[11px] text-content-muted whitespace-nowrap">{formatDate(ev.createdAt)}</span>
                  </div>
                  {renderMeta(ev.action, ev.metadata)}
                  {ev.actor && (
                    <div className="text-[11px] text-content-muted">
                      {ev.actor.displayName || ev.actor.username}
                      {ev.actor.role && <span className="opacity-70 ml-1">({ev.actor.role})</span>}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
