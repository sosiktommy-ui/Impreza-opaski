import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Bell, LogOut, Sun, Moon, AlertTriangle, Globe, Building2, Map as MapIcon, MapPin, ChevronDown } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { useAppStore, useBadgeStore } from '../../store/useAppStore';
import { useNotificationStore } from '../../store/useNotificationStore';
import { useThemeStore } from '../../store/useThemeStore';
import NotificationPanel from '../ui/NotificationPanel';
import BalanceWidget from '../ui/BalanceWidget';
import { authApi } from '../../api/auth';

const ROLE_LABELS = { ADMIN: 'Админ', OFFICE: 'Офис', COUNTRY: 'Страна', CITY: 'Город' };

const SCOPE_ICON = {
  GLOBAL: Globe,
  OFFICE: Building2,
  COUNTRY: MapIcon,
  CITY: MapPin,
};

const SCOPE_LABEL = {
  GLOBAL: 'Глобально',
  OFFICE: 'Офис',
  COUNTRY: 'Страна',
  CITY: 'Город',
};

function ScopePill() {
  const currentAccess = useAuthStore((s) => s.currentAccess);
  const switchScope = useAuthStore((s) => s.switchScope);
  const [open, setOpen] = useState(false);
  const [accesses, setAccesses] = useState(null);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!currentAccess) return null;

  const Icon = SCOPE_ICON[currentAccess.scopeType] ?? Globe;
  const targetName = currentAccess.target?.name
    ?? (currentAccess.scopeType === 'GLOBAL' ? 'Все подразделения' : '—');

  const toggle = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (accesses === null) {
      setLoading(true);
      try {
        const { data } = await authApi.myAccessesScoped();
        const list = data?.accesses ?? data?.data?.accesses ?? [];
        setAccesses(list);
      } catch {
        setAccesses([]);
      } finally {
        setLoading(false);
      }
    }
  };

  const pick = async (id) => {
    if (id === currentAccess.id) { setOpen(false); return; }
    try { await switchScope(id); } catch (err) {
      console.error('switchScope failed', err);
      setOpen(false);
    }
  };

  const hasAlternatives = (accesses?.length ?? 0) > 1;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-1.5 px-2 py-1 rounded-[var(--radius-sm)] border border-edge hover:bg-surface-card-hover text-content-primary text-xs font-medium transition-colors max-w-[220px]"
        title={`${SCOPE_LABEL[currentAccess.scopeType]}: ${targetName}`}
      >
        <Icon size={14} className="text-brand-500 shrink-0" />
        <span className="truncate">{targetName}</span>
        <ChevronDown size={12} className="text-content-muted shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 mt-1 w-64 bg-surface-card border border-edge rounded-[var(--radius-md)] shadow-lg z-40 p-1.5">
          {loading && <div className="text-xs text-content-muted px-2 py-2">Загрузка…</div>}
          {!loading && accesses && accesses.length === 0 && (
            <div className="text-xs text-content-muted px-2 py-2">Нет доступных областей</div>
          )}
          {!loading && accesses && accesses.length === 1 && (
            <div className="text-xs text-content-muted px-2 py-2">Других областей нет</div>
          )}
          {!loading && hasAlternatives && accesses.map((a) => {
            const ItemIcon = SCOPE_ICON[a.scopeType] ?? Globe;
            const name = a.target?.name ?? (a.scopeType === 'GLOBAL' ? 'Все подразделения' : '—');
            const active = a.id === currentAccess.id;
            return (
              <button
                key={a.id}
                onClick={() => pick(a.id)}
                disabled={active}
                className={`w-full flex items-center gap-2 px-2 py-2 rounded-[var(--radius-sm)] text-left text-sm transition-colors ${
                  active ? 'bg-brand-500/10 text-brand-500' : 'hover:bg-surface-card-hover text-content-primary'
                }`}
              >
                <ItemIcon size={14} className="shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{name}</div>
                  <div className="text-[10px] text-content-muted truncate">{SCOPE_LABEL[a.scopeType]}</div>
                </div>
                {active && <span className="text-[10px] text-brand-500">текущая</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const { toggleSidebar } = useAppStore();
  const { unreadCount, fetchUnreadCount } = useNotificationStore();
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
        <ScopePill />
      </div>

      <div className="flex items-center gap-2">
        <BalanceWidget />
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
