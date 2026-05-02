import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';

const ROLES = ['ADMIN', 'OFFICE', 'COUNTRY', 'MANAGER'];

const ITEMS = [
  { to: '/', label: 'Обзор', icon: '◇', roles: ROLES, end: true },
  { to: '/inventory', label: 'Склад', icon: '▦', roles: ROLES },
  { to: '/transfers', label: 'Передачи', icon: '⇄', roles: ROLES },
  { to: '/expenses', label: 'Расходы', icon: '€', roles: ROLES },
  { to: '/history', label: 'История', icon: '⌛', roles: ROLES },
  { to: '/users', label: 'Сотрудники', icon: '◉', roles: ['ADMIN', 'OFFICE', 'COUNTRY'] },
  { to: '/geodata', label: 'География', icon: '◎', roles: ['ADMIN', 'OFFICE'] },
  { to: '/settings', label: 'Настройки', icon: '⚙', roles: ROLES },
];

export default function Sidebar() {
  const { user, currentAccess, logout } = useAuthStore();
  const navigate = useNavigate();
  const role = user?.role;

  function onLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  const items = ITEMS.filter((i) => i.roles.includes(role));

  return (
    <aside
      className="hidden md:flex flex-col w-[240px] shrink-0 h-screen sticky top-0 border-r"
      style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
    >
      <div className="px-5 py-5 flex items-center gap-2.5">
        <div
          className="w-8 h-8 rounded-[10px] flex items-center justify-center"
          style={{ background: 'var(--accent)' }}
        >
          <span className="text-white font-bold">I</span>
        </div>
        <div>
          <div className="text-[14px] font-semibold leading-tight">Impreza</div>
          <div className="text-[10px] uppercase tracking-wider text-text-3 mono">
            {currentAccess?.scope === 'GLOBAL'
              ? 'Global'
              : currentAccess?.cityName || currentAccess?.countryName || '—'}
          </div>
        </div>
      </div>

      <nav className="px-3 flex-1 overflow-y-auto">
        <div className="text-[10px] uppercase tracking-wider text-text-3 px-3 mb-2 mt-2 font-semibold">
          Меню
        </div>
        <div className="space-y-0.5">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="text-[15px] w-5 text-center text-text-3">{it.icon}</span>
              <span>{it.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      <div
        className="p-3 border-t"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="px-3 py-2">
          <div className="text-[13px] font-semibold leading-tight truncate">
            {user?.displayName || user?.username}
          </div>
          <div className="text-[11px] text-text-3 mono mt-0.5">{role}</div>
        </div>
        <button onClick={onLogout} className="btn btn-ghost btn-block btn-sm mt-1">
          Выйти
        </button>
      </div>
    </aside>
  );
}
