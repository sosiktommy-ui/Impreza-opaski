import { useEffect, useState } from 'react';
import Header from '../components/layout/Header';
import UserCreateModal from '../components/domain/UserCreateModal';
import UserEditModal from '../components/domain/UserEditModal';
import { listUsers, ROLE_META } from '../api/users';
import { useAuthStore } from '../store/useAuthStore';

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

export default function Users() {
  const { user: me } = useAuthStore();
  const isAdmin = me?.role === 'ADMIN';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | active | inactive

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await listUsers();
      setItems(res || []);
    } catch (e) {
      setError(e?.response?.data?.error?.message || 'LOAD_FAILED');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  const filtered = items.filter((u) => {
    if (statusFilter === 'active' && !u.isActive) return false;
    if (statusFilter === 'inactive' && u.isActive) return false;
    if (search) {
      const q = search.toLowerCase();
      return u.username.toLowerCase().includes(q) || u.displayName?.toLowerCase().includes(q);
    }
    return true;
  });

  const activeCount = items.filter((u) => u.isActive).length;
  const inactiveCount = items.filter((u) => !u.isActive).length;

  return (
    <>
      <Header
        title="Настройки"
        subtitle="Аккаунты и доступы"
      />

      <div className="px-7 py-7 max-w-[1320px] mx-auto fade-in">
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="seg">
            <button className={`seg-btn ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>
              Все · {items.length}
            </button>
            <button className={`seg-btn ${statusFilter === 'active' ? 'active' : ''}`} onClick={() => setStatusFilter('active')}>
              Активные · {activeCount}
            </button>
            <button className={`seg-btn ${statusFilter === 'inactive' ? 'active' : ''}`} onClick={() => setStatusFilter('inactive')}>
              Заблокированные · {inactiveCount}
            </button>
          </div>
          <div className="ml-auto flex gap-2">
            <div className="relative" style={{ width: 240 }}>
              <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ color: 'var(--text-3)' }}>
                <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input
                className="input pl-9"
                placeholder="Поиск пользователя..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {isAdmin && (
              <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
                Добавить
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="card overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="shimmer" style={{ height: 52, borderTop: i > 0 ? '1px solid var(--border)' : undefined }} />
            ))}
          </div>
        ) : error ? (
          <div className="card p-6 text-center" style={{ color: 'var(--danger)' }}>{error}</div>
        ) : filtered.length === 0 ? (
          <div className="card p-10 text-center">
            <h2 className="text-[15px] font-semibold">Никого не найдено</h2>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="th" style={{ gridTemplateColumns: '1.5fr 1fr 1.4fr 110px 130px 36px' }}>
              <span>Пользователь</span>
              <span>Роль</span>
              <span>Доступ</span>
              <span>Статус</span>
              <span>Активность</span>
              <span />
            </div>
            {filtered.map((u) => {
              const r = ROLE_META[u.role] || { label: u.role, tone: 'muted' };
              const isMe = u.id === me?.id;
              const initials = (u.displayName || u.username || 'U')
                .split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
              const accStr = u.accesses?.length
                ? u.accesses.slice(0, 2).map((a) =>
                    a.scope === 'GLOBAL' ? 'Глобальный' : a.scope === 'COUNTRY' ? a.countryName : a.cityName
                  ).join(', ') + (u.accesses.length > 2 ? ` +${u.accesses.length - 2}` : '')
                : '—';
              const lastLogin = u.lastLoginAt
                ? (() => {
                    const diff = Date.now() - new Date(u.lastLoginAt).getTime();
                    const mins = Math.floor(diff / 60000);
                    if (mins < 2) return 'сейчас';
                    if (mins < 60) return `${mins} мин`;
                    const hrs = Math.floor(mins / 60);
                    if (hrs < 24) return `${hrs} ч`;
                    return `${Math.floor(hrs / 24)} дн`;
                  })()
                : '—';

              return (
                <div
                  key={u.id}
                  className="tr"
                  style={{ gridTemplateColumns: '1.5fr 1fr 1.4fr 110px 130px 36px', cursor: 'pointer' }}
                  onClick={() => setEditing(u)}
                >
                  <span className="flex items-center gap-2.5">
                    <span className="avatar" style={{ background: avatarColor(u.username) }}>{initials}</span>
                    <span>
                      <span className="font-medium block leading-tight">
                        {u.displayName || u.username}
                        {isMe && <span className="ml-1.5 text-[11px]" style={{ color: 'var(--text-3)' }}>вы</span>}
                      </span>
                      <span className="mono text-[12px]" style={{ color: 'var(--text-3)' }}>{u.username}</span>
                    </span>
                  </span>
                  <span><span className={`pill pill-${r.tone}`}>{r.label}</span></span>
                  <span className="text-[13px] truncate" style={{ color: 'var(--text-2)' }}>{accStr}</span>
                  <span>
                    {u.isActive
                      ? <span className="pill pill-success">Активен</span>
                      : <span className="pill pill-muted">Не активен</span>}
                  </span>
                  <span className="text-[12.5px]" style={{ color: 'var(--text-3)' }}>{lastLogin}</span>
                  <button
                    className="btn btn-ghost btn-sm btn-icon"
                    onClick={(e) => { e.stopPropagation(); setEditing(u); }}
                  >
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <UserCreateModal open={createOpen} onClose={() => setCreateOpen(false)} onDone={refresh} />
      <UserEditModal
        open={!!editing}
        user={editing}
        isAdmin={isAdmin}
        onClose={() => setEditing(null)}
        onDone={refresh}
      />
    </>
  );
}
