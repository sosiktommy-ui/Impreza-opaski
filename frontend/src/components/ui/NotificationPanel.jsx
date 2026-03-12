import { useEffect, useRef } from 'react';
import { Check, CheckCheck, X } from 'lucide-react';
import { useNotificationStore } from '../../store/useNotificationStore';

const TYPE_STYLES = {
  INCOMING_TRANSFER: 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800',
  TRANSFER_ACCEPTED: 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800',
  TRANSFER_REJECTED: 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800',
  DISCREPANCY_ALERT: 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800',
  LOW_STOCK: 'bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800',
  ZERO_STOCK: 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800',
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин.`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч.`;
  const days = Math.floor(hours / 24);
  return `${days} дн.`;
}

export default function NotificationPanel({ onClose }) {
  const { notifications, loading, fetchNotifications, markAsRead, markAllAsRead, unreadCount } =
    useNotificationStore();
  const panelRef = useRef(null);

  useEffect(() => {
    fetchNotifications();
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-2 w-96 max-h-[480px] bg-surface-elevated rounded-[var(--radius-md)] shadow-lg border border-edge flex flex-col z-50 overflow-hidden animate-scaleIn"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
        <h3 className="font-semibold text-content-primary text-sm">
          Уведомления {unreadCount > 0 && <span className="text-brand-500">({unreadCount})</span>}
        </h3>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-xs text-brand-500 hover:text-brand-400 font-medium flex items-center gap-1 transition-colors"
            >
              <CheckCheck size={14} /> Прочитать все
            </button>
          )}
          <button onClick={onClose} className="p-1 rounded-[var(--radius-sm)] hover:bg-surface-card-hover text-content-muted transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto divide-y divide-edge">
        {loading && notifications.length === 0 && (
          <div className="p-6 text-center text-sm text-content-muted">Загрузка...</div>
        )}

        {!loading && notifications.length === 0 && (
          <div className="p-6 text-center text-sm text-content-muted">Нет уведомлений</div>
        )}

        {notifications.map((n) => (
          <div
            key={n.id}
            className={`px-4 py-3 flex items-start gap-3 transition-colors cursor-pointer hover:bg-surface-card-hover ${
              !n.read ? 'bg-brand-500/5' : ''
            }`}
            onClick={() => !n.read && markAsRead(n.id)}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className={`text-sm leading-snug ${!n.read ? 'font-semibold text-content-primary' : 'text-content-secondary'}`}>
                  {n.title}
                </p>
                <span className="text-2xs text-content-muted whitespace-nowrap flex-shrink-0">
                  {timeAgo(n.createdAt)}
                </span>
              </div>
              <p className="text-xs text-content-muted mt-0.5 line-clamp-2">{n.message}</p>
            </div>
            {!n.read && (
              <div className="w-2 h-2 rounded-full bg-brand-500 flex-shrink-0 mt-1.5" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
