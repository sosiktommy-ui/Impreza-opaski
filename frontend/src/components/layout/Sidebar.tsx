'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Package,
  ClipboardList,
  Users,
  Shield,
  Bell,
  LogOut,
  Menu,
  X,
  Map,
} from 'lucide-react';
import { useState, useEffect } from 'react';

const navigation = [
  { name: 'Обзор', href: '/dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'COUNTRY', 'CITY'] },
  { name: 'Карта', href: '/map', icon: Map, roles: ['ADMIN', 'COUNTRY', 'CITY'] },
  { name: 'Склад', href: '/inventory', icon: Package, roles: ['ADMIN', 'COUNTRY', 'CITY'] },
  { name: 'Трансферы', href: '/transfers', icon: ArrowLeftRight, roles: ['ADMIN', 'COUNTRY', 'CITY'] },
  { name: 'История', href: '/history', icon: ClipboardList, roles: ['ADMIN', 'COUNTRY'] },
  { name: 'Пользователи', href: '/users', icon: Users, roles: ['ADMIN'] },
  { name: 'Аудит', href: '/audit', icon: Shield, roles: ['ADMIN'] },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { unreadCount, fetchUnreadCount } = useNotificationStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  const filteredNav = navigation.filter(
    (item) => user && item.roles.includes(user.role),
  );

  const handleLogout = async () => {
    await logout();
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-dark-600">
        <div className="w-10 h-10 bg-gradient-to-br from-accent-purple to-accent-blue rounded-xl flex items-center justify-center font-bold text-sm text-white">
          IM
        </div>
        <div>
          <span className="text-lg font-bold text-white tracking-tight">IMPREZA</span>
          <p className="text-[10px] text-dark-300 uppercase tracking-widest">Панель управления</p>
        </div>
      </div>

      {/* User info */}
      <div className="px-4 py-4 border-b border-dark-600">
        <p className="text-sm font-medium text-white truncate">{user?.displayName}</p>
        <p className="text-xs text-dark-300 truncate">{user?.role}</p>
        {user?.country && (
          <p className="text-xs text-dark-400 truncate">{user.country.name}</p>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {filteredNav.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-accent-purple/15 text-accent-purple border border-accent-purple/20'
                  : 'text-dark-200 hover:bg-dark-700 hover:text-white border border-transparent',
              )}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {item.name}
            </Link>
          );
        })}

        {/* Notifications link */}
        <Link
          href="/notifications"
          onClick={() => setMobileOpen(false)}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
            pathname === '/notifications'
              ? 'bg-accent-purple/15 text-accent-purple border border-accent-purple/20'
              : 'text-dark-200 hover:bg-dark-700 hover:text-white border border-transparent',
          )}
        >
          <Bell className="w-5 h-5 shrink-0" />
          Уведомления
          {unreadCount > 0 && (
            <span className="ml-auto bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Link>
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-dark-600">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-dark-200 hover:bg-dark-700 hover:text-white transition-colors"
        >
          <LogOut className="w-5 h-5" />
          Выйти
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-dark-800 text-white"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 bg-dark-800 border-r border-dark-600 transform transition-transform duration-200',
          'lg:translate-x-0 lg:static lg:shrink-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
