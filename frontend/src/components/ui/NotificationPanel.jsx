import { useEffect, useRef } from 'react';
import { Check, CheckCheck, X } from 'lucide-react';
import { useNotificationStore } from '../../store/useNotificationStore';

const TYPE_STYLES = {
  INCOMING_TRANSFER: 'bg-blue-50 border-blue-200',
  TRANSFER_ACCEPTED: 'bg-green-50 border-green-200',
  TRANSFER_REJECTED: 'bg-red-50 border-red-200',
  DISCREPANCY_ALERT: 'bg-amber-50 border-amber-200',
  LOW_STOCK: 'bg-orange-50 border-orange-200',
  ZERO_STOCK: 'bg-red-50 border-red-200',
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
      className="absolute right-0 top-full mt-2 w-96 max-h-[480px] bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 flex flex-col z-50 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <h3 className="font-semibold text-gray-800 dark:text-gray-100 text-sm">
          Уведомления {unreadCount > 0 && <span className="text-red-500">({unreadCount})</span>}
        </h3>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1"
            >
              <CheckCheck size={14} /> Прочитать все
            </button>
          )}
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
        {loading && notifications.length === 0 && (
          <div className="p-6 text-center text-sm text-gray-400">Загрузка...</div>
        )}

        {!loading && notifications.length === 0 && (
          <div className="p-6 text-center text-sm text-gray-400">Нет уведомлений</div>
        )}

        {notifications.map((n) => (
          <div
            key={n.id}
            className={`px-4 py-3 flex items-start gap-3 transition-colors cursor-pointer hover:bg-gray-50 ${
              !n.read ? 'bg-blue-50/40' : ''
            }`}
            onClick={() => !n.read && markAsRead(n.id)}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className={`text-sm leading-snug ${!n.read ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                  {n.title}
                </p>
                <span className="text-[11px] text-gray-400 whitespace-nowrap flex-shrink-0">
                  {timeAgo(n.createdAt)}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
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
