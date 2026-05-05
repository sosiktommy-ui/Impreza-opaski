import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import ThemeToggle from '../ui/ThemeToggle';

const ROLES = ['ADMIN', 'OFFICE', 'COUNTRY', 'MANAGER'];

const MAIN_ITEMS = [
  {
    to: '/', label: 'Главная', roles: ROLES, end: true,
    icon: <svg className="nav-ic" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M3 12L12 4l9 8M5 10v10h14V10"/></svg>,
  },
  {
    to: '/inventory', label: 'Баланс', roles: ROLES,
    icon: <svg className="nav-ic" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5M12 13v10"/></svg>,
  },
  {
    to: '/transfers', label: 'Отправки', roles: ROLES,
    icon: <svg className="nav-ic" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M17 3l4 4-4 4M21 7H9M7 21l-4-4 4-4M3 17h12"/></svg>,
  },
  {
    to: '/expenses', label: 'Расходы', roles: ROLES,
    icon: <svg className="nav-ic" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
  },
  {
    to: '/history', label: 'История', roles: ROLES,
    icon: <svg className="nav-ic" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  },
];

const MANAGE_ITEMS = [
  {
    to: '/users', label: 'Настройки', roles: ['ADMIN', 'OFFICE', 'COUNTRY'],
    icon: <svg className="nav-ic" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.87M17 3.13a4 4 0 010 7.75"/></svg>,
  },
  {
    to: '/geodata', label: 'Геоданные', roles: ['ADMIN', 'OFFICE'],
    icon: <svg className="nav-ic" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>,
  },
  {
    to: '/settings', label: 'Настройки', roles: ROLES,
    icon: <svg className="nav-ic" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09c0 .66.39 1.26 1 1.51a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9c.25.61.85 1 1.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  },
];

function scopeLabel(access) {
  if (!access) return '—';
  if (access.scope === 'GLOBAL') return 'Все страны';
  if (access.scope === 'COUNTRY') return access.countryName || access.scope;
  return access.cityName || access.scope;
}

function scopeSub(access) {
  if (!access) return '';
  if (access.scope === 'GLOBAL') return 'Глобальный';
  if (access.scope === 'COUNTRY') return 'Страна';
  return (access.countryName ? access.countryName + ' · ' : '') + 'Город';
}

function avatarColor(username) {
  const colors = [
    'linear-gradient(135deg,#8b5cf6,#a78bfa)',
    'linear-gradient(135deg,#f59e0b,#ea580c)',
    'linear-gradient(135deg,#06b6d4,#0891b2)',
    'linear-gradient(135deg,#ec4899,#be185d)',
    'linear-gradient(135deg,#10b981,#047857)',
    'linear-gradient(135deg,#6366f1,#4f46e5)',
  ];
  let h = 0;
  for (let i = 0; i < (username || '').length; i++) h = (h * 31 + username.charCodeAt(i)) & 0xffff;
  return colors[h % colors.length];
}

export default function Sidebar() {
  const { user, currentAccess, logout } = useAuthStore();
  const navigate = useNavigate();
  const role = user?.role;

  function onLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  const mainItems = MAIN_ITEMS.filter((i) => i.roles.includes(role));
  const manageItems = MANAGE_ITEMS.filter((i) => i.roles.includes(role));

  const initials = (user?.displayName || user?.username || 'U')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <aside
      className="hidden md:flex flex-col w-[232px] shrink-0 h-screen sticky top-0 border-r"
      style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
    >
      {/* Logo */}
      <div className="px-4 pt-5 pb-4 flex items-center gap-2.5">
        <div
          className="w-7 h-7 rounded-lg grid place-items-center text-white font-bold"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', fontSize: 13 }}
        >
          I
        </div>
        <div className="flex-1">
          <div className="font-semibold text-[14px] tracking-tight">Impreza</div>
          <div className="mono text-[10px]" style={{ color: 'var(--text-3)' }}>Operations</div>
        </div>
        <ThemeToggle className="btn-sm btn-icon" />
      </div>

      {/* Workspace switcher */}
      <div className="px-3 mb-3">
        <div className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg" style={{ background: 'var(--surface-2)' }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" style={{ color: 'var(--text-3)', flexShrink: 0 }}>
            <circle cx="12" cy="12" r="9"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/>
          </svg>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-semibold leading-tight truncate">{scopeLabel(currentAccess)}</div>
            <div className="text-[10.5px] leading-tight mt-0.5 truncate" style={{ color: 'var(--text-3)' }}>{scopeSub(currentAccess)}</div>
          </div>
        </div>
      </div>

      {/* Main nav */}
      <div className="text-[10px] uppercase tracking-[0.08em] font-semibold px-4 mb-1.5" style={{ color: 'var(--text-3)' }}>
        Главное
      </div>
      <nav className="px-2 space-y-0.5">
        {mainItems.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            {it.icon}
            <span>{it.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Manage nav */}
      {manageItems.length > 0 && (
        <>
          <div className="text-[10px] uppercase tracking-[0.08em] font-semibold px-4 mb-1.5 mt-5" style={{ color: 'var(--text-3)' }}>
            Управление
          </div>
          <nav className="px-2 space-y-0.5">
            {manageItems.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                {it.icon}
                <span>{it.label}</span>
              </NavLink>
            ))}
          </nav>
        </>
      )}

      {/* User footer */}
      <div className="mt-auto p-3 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2.5 px-1.5 py-1">
          <div
            className="avatar"
            style={{ background: avatarColor(user?.username) }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-semibold truncate">{user?.displayName || user?.username}</div>
            <div className="text-[10.5px] truncate" style={{ color: 'var(--text-3)' }}>
              {currentAccess?.scope === 'GLOBAL' ? 'Глобальный' : currentAccess?.scope === 'COUNTRY' ? currentAccess.countryName : currentAccess?.cityName} · {role}
            </div>
          </div>
          <button
            onClick={onLogout}
            className="btn btn-ghost btn-sm btn-icon"
            title="Выйти"
          >
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M16 17l5-5-5-5M21 12H9M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
