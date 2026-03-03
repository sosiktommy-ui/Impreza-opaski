import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Send,
  PackageCheck,
  AlertTriangle,
  CalendarDays,
  Boxes,
  Users,
  MapPin,
  X,
  MessageCircle,
  UserCircle,
} from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { useAppStore } from '../../store/useAppStore';

const allLinks = [
  { to: '/', icon: LayoutDashboard, label: 'Главная', roles: ['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'] },
  { to: '/transfers', icon: Send, label: 'Мои отправки', roles: ['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'] },
  { to: '/acceptance', icon: PackageCheck, label: 'Приёмка', roles: ['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'] },
  { to: '/problematic', icon: AlertTriangle, label: 'Проблемные', roles: ['ADMIN', 'OFFICE'] },
  { to: '/expenses', icon: CalendarDays, label: 'Мероприятия', roles: ['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'] },
  { to: '/inventory', icon: Boxes, label: 'Остатки', roles: ['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'] },
  { to: '/users', icon: Users, label: 'Пользователи', roles: ['ADMIN', 'OFFICE'] },
  { to: '/map', icon: MapPin, label: 'Карта', roles: ['ADMIN', 'OFFICE'] },
  { to: '/chat', icon: MessageCircle, label: 'Чат', roles: ['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'] },
  { to: '/profile', icon: UserCircle, label: 'Профиль', roles: ['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'] },
];

export default function Sidebar() {
  const { user } = useAuthStore();
  const { sidebarOpen, closeSidebar } = useAppStore();
  const location = useLocation();

  const links = allLinks.filter((l) => l.roles.includes(user?.role));

  const navContent = (
    <nav className="flex flex-col gap-1 p-3">
      {links.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={label}
          to={to}
          onClick={closeSidebar}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
            ${isActive ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200'}`
          }
          end={to === '/'}
        >
          <Icon size={20} />
          {label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fixed inset-0 bg-black/30" onClick={closeSidebar} />
          <aside className="fixed left-0 top-0 bottom-0 w-64 bg-white dark:bg-gray-800 shadow-xl z-50 flex flex-col">
            <div className="flex items-center justify-between px-4 h-14 border-b border-gray-200 dark:border-gray-700">
              <span className="font-bold text-brand-700">IMPREZA</span>
              <button
                onClick={closeSidebar}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
              >
                <X size={20} />
              </button>
            </div>
            {navContent}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-60 lg:border-r lg:border-gray-200 dark:lg:border-gray-700 bg-white dark:bg-gray-800 min-h-0">
        {navContent}
      </aside>
    </>
  );
}
