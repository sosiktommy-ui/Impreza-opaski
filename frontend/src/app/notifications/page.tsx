'use client';

import { useEffect } from 'react';
import { useNotificationStore } from '@/store/notifications';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { formatDate, cn } from '@/lib/utils';
import { Bell, CheckCheck, Check } from 'lucide-react';

const NOTIFICATION_TYPE_COLORS: Record<string, string> = {
  INCOMING_TRANSFER: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  TRANSFER_ACCEPTED: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  DISCREPANCY_ALERT: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  TRANSFER_REJECTED: 'bg-red-500/20 text-red-400 border border-red-500/30',
  TRANSFER_CANCELLED: 'bg-dark-500/50 text-dark-200 border border-dark-400',
  LOW_STOCK: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  ZERO_STOCK: 'bg-red-500/20 text-red-400 border border-red-500/30',
};

export default function NotificationsPage() {
  const {
    notifications,
    unreadCount,
    isLoading,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
  } = useNotificationStore();

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Уведомления</h1>
          <p className="text-dark-200 mt-1">
            {unreadCount > 0 ? `${unreadCount} непрочитанных` : 'Всё прочитано'}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllAsRead}>
            <CheckCheck className="w-4 h-4 mr-1" />
            Прочитать все
          </Button>
        )}
      </div>

      <Card noPadding>
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent-purple" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-dark-300">
            <Bell className="w-12 h-12 mb-3" />
            <p className="text-sm">Уведомлений пока нет</p>
          </div>
        ) : (
          <div className="divide-y divide-dark-600">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={cn(
                  'px-6 py-4 flex items-start gap-4 transition-colors',
                  !n.read && 'bg-accent-purple/5',
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={cn('text-sm font-medium', !n.read ? 'text-white' : 'text-dark-200')}>
                      {n.title}
                    </p>
                    <Badge variant={NOTIFICATION_TYPE_COLORS[n.type] || 'bg-dark-500/50 text-dark-200 border border-dark-400'}>
                      {n.type.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <p className="text-sm text-dark-200 mt-0.5">{n.message}</p>
                  <p className="text-xs text-dark-300 mt-1">{formatDate(n.createdAt)}</p>
                </div>
                {!n.read && (
                  <button
                    onClick={() => markAsRead(n.id)}
                    className="shrink-0 p-1.5 rounded-xl text-accent-purple hover:bg-accent-purple/10 transition-colors"
                    title="Отметить как прочитанное"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
