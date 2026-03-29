import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Bell, LogOut, Sun, Moon, MessageCircle, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { useAppStore, useBadgeStore } from '../../store/useAppStore';
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
  const { problematicCount, companyLossCount } = useBadgeStore();
  const [showNotifications, setShowNotifications] = useState(false);
  const bellRef = useRef(null);
  const hasCritical = (problematicCount || 0) > 0 || (companyLossCount || 0) > 5;

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000); // poll every 30s
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="sticky top-0 z-30 bg-surface-secondary border-b border-edge px-4 h-14 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <button
          onClick={toggleSidebar}
          className="lg:hidden p-1.5 rounded-[var(--radius-sm)] hover:bg-surface-card-hover text-content-muted transition-colors"
        >
          <Menu size={22} />
        </button>
        <h1 className="text-lg font-bold text-brand-500 tracking-tight">IMPREZA</h1>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-[var(--radius-sm)] hover:bg-surface-card-hover text-content-muted transition-colors"
          title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        {hasCritical && (user?.role === 'ADMIN' || user?.role === 'OFFICE') && (
          <button
            onClick={() => navigate('/problematic')}
            className="p-1.5 rounded-[var(--radius-sm)] hover:bg-red-500/10 text-red-500 relative transition-colors animate-pulse"
            title="Есть критические проблемы"
          >
            <AlertTriangle size={20} />
          </button>
        )}

        <button
          onClick={() => navigate('/chat')}
          className="p-1.5 rounded-[var(--radius-sm)] hover:bg-surface-card-hover text-content-muted relative transition-colors"
          title="Чат"
        >
          <MessageCircle size={20} />
          {chatUnread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-brand-600 text-white text-[10px] font-bold px-1 leading-none">
              {chatUnread > 99 ? '99+' : chatUnread}
            </span>
          )}
        </button>

        <div className="relative" ref={bellRef}>
          <button
            onClick={() => setShowNotifications((v) => !v)}
            className="p-1.5 rounded-[var(--radius-sm)] hover:bg-surface-card-hover text-content-muted relative transition-colors"
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
            <img src={user.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover ring-1 ring-edge" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-brand-600/15 text-brand-400 flex items-center justify-center text-xs font-bold">
              {(user?.displayName || '?').charAt(0).toUpperCase()}
            </div>
          )}
          <span className="font-medium text-content-primary">{user?.displayName}</span>
          <span className="text-xs text-content-muted">{ROLE_LABELS[user?.role]}</span>
        </button>

        <button
          onClick={logout}
          className="p-1.5 rounded-[var(--radius-sm)] hover:bg-red-500/10 text-content-muted hover:text-red-400 transition-colors"
          title="Выйти"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
