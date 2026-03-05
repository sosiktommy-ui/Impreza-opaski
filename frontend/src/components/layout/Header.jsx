import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Bell, LogOut, Sun, Moon, MessageCircle } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { useAppStore } from '../../store/useAppStore';
import { useNotificationStore } from '../../store/useNotificationStore';
import { useChatStore } from '../../store/useChatStore';
import { useThemeStore } from '../../store/useThemeStore';
import NotificationPanel from '../ui/NotificationPanel';

const ROLE_LABELS = { ADMIN: 'Админ', OFFICE: 'Офис', COUNTRY: 'Страна', CITY: 'Город' };

export default function Header() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const { toggleSidebar } = useAppStore();
  const { unreadCount, fetchUnreadCount } = useNotificationStore();
  const { unreadCount: chatUnread } = useChatStore();
  const { theme, toggleTheme } = useThemeStore();
  const [showNotifications, setShowNotifications] = useState(false);
  const bellRef = useRef(null);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000); // poll every 30s
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="sticky top-0 z-30 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 h-14 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <button
          onClick={toggleSidebar}
          className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
        >
          <Menu size={22} />
        </button>
        <h1 className="text-lg font-bold text-brand-700 tracking-tight">IMPREZA</h1>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
          title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        <button
          onClick={() => navigate('/chat')}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 relative"
          title="Чат"
        >
          <MessageCircle size={20} />
          {chatUnread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-brand-500 text-white text-[10px] font-bold px-1 leading-none">
              {chatUnread > 99 ? '99+' : chatUnread}
            </span>
          )}
        </button>

        <div className="relative" ref={bellRef}>
          <button
            onClick={() => setShowNotifications((v) => !v)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 relative"
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

        <button
          onClick={() => navigate('/profile')}
          className="hidden sm:flex items-center gap-2 text-sm hover:opacity-80 transition-opacity"
          title="Профиль"
        >
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-900 text-brand-600 dark:text-brand-300 flex items-center justify-center text-xs font-bold">
              {(user?.displayName || '?').charAt(0).toUpperCase()}
            </div>
          )}
          <span className="font-medium text-gray-700 dark:text-gray-200">{user?.displayName}</span>
          <span className="text-xs text-gray-400 dark:text-gray-500">{ROLE_LABELS[user?.role]}</span>
        </button>

        <button
          onClick={logout}
          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors"
          title="Выйти"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
