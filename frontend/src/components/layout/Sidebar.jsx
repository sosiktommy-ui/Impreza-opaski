import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutGrid,
  ArrowLeftRight,
  Warehouse,
  BarChart3,
  SlidersHorizontal,
  CircleUserRound,
  X,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { useAppStore, useBadgeStore } from '../../store/useAppStore';
import { useEffect } from 'react';
import { transfersApi } from '../../api/transfers';
import { inventoryApi } from '../../api/inventory';

const MENU_TOOLTIPS = {
  '/': 'Общая сводка и статистика',
  '/transfers': 'Переводы: отправки, входящие, незавершённые, проблемы',
  '/accounting': 'Учёт: баланс, расходы, потери',
  '/analytics': 'Аналитика: статистика, история, карта',
  '/users': 'Управление пользователями и настройки',
  '/profile': 'Ваш профиль и настройки аккаунта',
};

const allLinks = [
  { to: '/',           icon: LayoutGrid,        label: 'Главная',    roles: ['ADMIN','OFFICE','COUNTRY','CITY'], badgeKey: null },
  { to: '/transfers',  icon: ArrowLeftRight,     label: 'Переводы',   roles: ['ADMIN','OFFICE','COUNTRY','CITY'], badgeKey: 'transfers' },
  { to: '/accounting', icon: Warehouse,          label: 'Учёт',       roles: ['ADMIN','OFFICE','COUNTRY','CITY'], badgeKey: 'companyLoss' },
  { to: '/analytics',  icon: BarChart3,          label: 'Аналитика',  roles: ['ADMIN','OFFICE','COUNTRY','CITY'], badgeKey: null },
  { to: '/users',      icon: SlidersHorizontal,  label: 'Управление', roles: ['ADMIN','OFFICE'],                  badgeKey: null },
  { to: '/profile',    icon: CircleUserRound,    label: 'Профиль',    roles: ['ADMIN','OFFICE','COUNTRY','CITY'], badgeKey: null },
];

export default function Sidebar() {
  const { user } = useAuthStore();
  const { sidebarOpen, closeSidebar, sidebarCollapsed, toggleCollapsed } = useAppStore();
  const { pendingCount, problematicCount, incomingCount, companyLossCount, refreshCounts } = useBadgeStore();

  useEffect(() => {
    // Initial fetch and polling for badge counts
    refreshCounts(transfersApi, inventoryApi);
    const badgeInterval = setInterval(() => refreshCounts(transfersApi, inventoryApi), 30000);
    return () => {
      clearInterval(badgeInterval);
    };
  }, []);

  const links = allLinks.filter((l) => l.roles.includes(user?.role));

  // Get badge count for a link
  const getBadge = (badgeKey) => {
    if (badgeKey === 'transfers') {
      const total = incomingCount + pendingCount + problematicCount;
      return total > 0 ? total : null;
    }
    if (badgeKey === 'companyLoss') return companyLossCount > 0 ? companyLossCount : null;
    return null;
  };

  const getBadgeColor = (badgeKey) => {
    if (badgeKey === 'transfers')  return 'bg-brand-600';
    if (badgeKey === 'companyLoss') return 'bg-red-500';
    return 'bg-brand-600';
  };

  const navContent = (collapsed) => (
    <nav className="flex flex-col gap-1 p-2">
      {links.map(({ to, icon: Icon, label, badgeKey }) => {
        const badge = getBadge(badgeKey);
        const badgeColor = getBadgeColor(badgeKey);
        return (
          <NavLink
            key={to}
            to={to}
            onClick={closeSidebar}
            title={MENU_TOOLTIPS[to] || label}
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
                  <span className={`min-w-[20px] h-5 flex items-center justify-center rounded-full ${badgeColor} text-white text-2xs font-bold px-1.5 animate-pulse`}>
                    {badge}
                  </span>
                )}
                {collapsed && badge && (
                  <span className={`absolute top-1 right-1 w-2.5 h-2.5 ${badgeColor} rounded-full ring-2 ring-surface-secondary`} />
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
