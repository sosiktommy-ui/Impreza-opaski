import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutGrid,
  Truck,
  PackageCheck,
  ShieldAlert,
  Receipt,
  Warehouse,
  SlidersHorizontal,
  X,
  MessagesSquare,
  CircleUserRound,
  ClockArrowUp,
  PanelLeftClose,
  PanelLeft,
  MapPinned,
} from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { useAppStore } from '../../store/useAppStore';
import { useChatStore } from '../../store/useChatStore';
import { useEffect } from 'react';

const allLinks = [
  { to: '/', icon: LayoutGrid, label: 'Главная', roles: ['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'] },
  { to: '/transfers', icon: Truck, label: 'Отправки', roles: ['ADMIN', 'OFFICE', 'COUNTRY'] },
  { to: '/acceptance', icon: PackageCheck, label: 'Получение', roles: ['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'] },
  { to: '/problematic', icon: ShieldAlert, label: 'Проблемные', roles: ['ADMIN', 'OFFICE'] },
  { to: '/expenses', icon: Receipt, label: 'Расходы', roles: ['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'] },
  { to: '/inventory', icon: Warehouse, label: 'Остатки', roles: ['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'] },
  { to: '/map', icon: MapPinned, label: 'Карта', roles: ['ADMIN', 'OFFICE', 'COUNTRY'] },
  { to: '/history', icon: ClockArrowUp, label: 'История', roles: ['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'] },
  { to: '/chat', icon: MessagesSquare, label: 'Чат', roles: ['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'] },
  { to: '/users', icon: SlidersHorizontal, label: 'Настройки', roles: ['ADMIN', 'OFFICE'] },
  { to: '/profile', icon: CircleUserRound, label: 'Профиль', roles: ['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'] },
];

export default function Sidebar() {
  const { user } = useAuthStore();
  const { sidebarOpen, closeSidebar, sidebarCollapsed, toggleCollapsed } = useAppStore();
  const { unreadCount, startPolling, stopPolling } = useChatStore();

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, []);

  const links = allLinks.filter((l) => l.roles.includes(user?.role));

  const navContent = (collapsed) => (
    <nav className="flex flex-col gap-1 p-2">
      {links.map(({ to, icon: Icon, label }) => {
        const badge = to === '/chat' && unreadCount > 0 ? unreadCount : null;
        return (
          <NavLink
            key={label}
            to={to}
            onClick={closeSidebar}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              `group relative flex items-center ${collapsed ? 'justify-center' : ''} gap-3 ${collapsed ? 'px-2' : 'px-3'} py-2.5 rounded-lg text-sm font-medium transition-all duration-200
              ${isActive
                ? 'bg-brand-600/15 text-brand-500 shadow-sm shadow-brand-600/10'
                : 'text-content-secondary hover:bg-surface-card-hover hover:text-content-primary hover:translate-x-0.5'
              }`
            }
            end={to === '/'}
          >
            {({ isActive }) => (
              <>
                {isActive && !collapsed && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-brand-500 rounded-r-full" />
                )}
                <Icon size={20} strokeWidth={isActive ? 2 : 1.6} className="flex-shrink-0 transition-all" />
                {!collapsed && <span className="flex-1 truncate">{label}</span>}
                {!collapsed && badge && (
                  <span className="min-w-[20px] h-5 flex items-center justify-center rounded-full bg-brand-600 text-white text-2xs font-bold px-1.5 animate-pulse">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
                {collapsed && badge && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-brand-500 rounded-full ring-2 ring-surface-secondary" />
                )}
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden animate-fadeIn">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={closeSidebar} />
          <aside className="fixed left-0 top-0 bottom-0 w-64 bg-surface-secondary shadow-lg z-50 flex flex-col animate-slideInRight">
            <div className="flex items-center justify-between px-4 h-14 border-b border-edge">
              <span className="font-bold text-brand-500 tracking-tight">IMPREZA</span>
              <button
                onClick={closeSidebar}
                className="p-1.5 rounded-[var(--radius-sm)] hover:bg-surface-card-hover text-content-muted transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            {navContent(false)}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className={`hidden lg:flex lg:flex-col ${sidebarCollapsed ? 'lg:w-16' : 'lg:w-60'} lg:border-r lg:border-edge bg-surface-secondary min-h-0 transition-all duration-200`}>
        <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between'} px-3 h-10`}>
          {!sidebarCollapsed && (
            <span className="text-2xs font-semibold text-content-muted uppercase tracking-widest">Меню</span>
          )}
          <button
            onClick={toggleCollapsed}
            className="p-1 rounded-[var(--radius-sm)] hover:bg-surface-card-hover text-content-muted transition-colors"
            title={sidebarCollapsed ? 'Развернуть' : 'Свернуть'}
          >
            {sidebarCollapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>
        {navContent(sidebarCollapsed)}
      </aside>
    </>
  );
}
