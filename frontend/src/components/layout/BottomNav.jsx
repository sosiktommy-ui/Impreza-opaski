import { NavLink } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';

const ALL_ITEMS = [
  { to: '/', icon: '◇', label: 'Обзор', roles: ['ADMIN','OFFICE','COUNTRY','MANAGER'], end: true },
  { to: '/inventory', icon: '▦', label: 'Баланс', roles: ['ADMIN','OFFICE','COUNTRY','MANAGER'] },
  { to: '/transfers', icon: '⇄', label: 'Передачи', roles: ['ADMIN','OFFICE','COUNTRY','MANAGER'] },
  { to: '/expenses', icon: '€', label: 'Расходы', roles: ['ADMIN','OFFICE','COUNTRY','MANAGER'] },
  { to: '/settings', icon: '⚙', label: 'Ещё', roles: ['ADMIN','OFFICE','COUNTRY','MANAGER'] },
];

export default function BottomNav() {
  const { user } = useAuthStore();
  const role = user?.role;
  const items = ALL_ITEMS.filter((i) => i.roles.includes(role));

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 flex items-center justify-around border-t"
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--border)',
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
        zIndex: 50,
      }}
    >
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.end}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 py-2 px-3 flex-1 transition-colors ${
              isActive ? '' : ''
            }`
          }
          style={({ isActive }) => ({
            color: isActive ? 'var(--accent)' : 'var(--text-3)',
          })}
        >
          <span className="text-[18px]">{it.icon}</span>
          <span className="text-[9px] font-semibold uppercase tracking-wide">{it.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
