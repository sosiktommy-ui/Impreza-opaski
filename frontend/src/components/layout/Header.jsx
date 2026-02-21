import { useEffect, useRef, useState } from 'react';
import { Menu, Bell, LogOut } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { useAppStore } from '../../store/useAppStore';
import { useNotificationStore } from '../../store/useNotificationStore';
import NotificationPanel from '../ui/NotificationPanel';

const ROLE_LABELS = { ADMIN: 'Админ', OFFICE: 'Офис', COUNTRY: 'Страна', CITY: 'Город' };

export default function Header() {
  const { user, logout } = useAuthStore();
  const { toggleSidebar } = useAppStore();
  const { unreadCount, fetchUnreadCount } = useNotificationStore();
  const [showNotifications, setShowNotifications] = useState(false);
  const bellRef = useRef(null);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000); // poll every 30s
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 h-14 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <button
          onClick={toggleSidebar}
          className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
        >
          <Menu size={22} />
        </button>
        <h1 className="text-lg font-bold text-brand-700 tracking-tight">IMPREZA</h1>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative" ref={bellRef}>
          <button
            onClick={() => setShowNotifications((v) => !v)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 relative"
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 leading-none">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <NotificationPanel onClose={() => setShowNotifications(false)} />
          )}
        </div>

        <div className="hidden sm:flex items-center gap-2 text-sm">
          <span className="font-medium text-gray-700">{user?.displayName}</span>
          <span className="text-xs text-gray-400">{ROLE_LABELS[user?.role]}</span>
        </div>

        <button
          onClick={logout}
          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
          title="Выйти"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
