import { Menu, Bell, LogOut } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { useAppStore } from '../../store/useAppStore';

const ROLE_LABELS = { ADMIN: 'Админ', COUNTRY: 'Страна', CITY: 'Город' };

export default function Header() {
  const { user, logout } = useAuthStore();
  const { toggleSidebar } = useAppStore();

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
        <button className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 relative">
          <Bell size={20} />
        </button>

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
