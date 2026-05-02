import { useEffect, useState } from 'react';
import Header from '../components/layout/Header';
import UserCreateModal from '../components/domain/UserCreateModal';
import UserEditModal from '../components/domain/UserEditModal';
import { listUsers, ROLE_META } from '../api/users';
import { useAuthStore } from '../store/useAuthStore';

export default function Users() {
  const { user: me } = useAuthStore();
  const isAdmin = me?.role === 'ADMIN';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');

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

  useEffect(() => {
    refresh();
  }, []);

  const filtered = search
    ? items.filter(
        (u) =>
          u.username.toLowerCase().includes(search.toLowerCase()) ||
          u.displayName?.toLowerCase().includes(search.toLowerCase()),
      )
    : items;

  return (
    <>
      <Header
        title="Сотрудники"
        subtitle={`${items.length} учётных записей`}
        right={
          isAdmin && (
            <button className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
              + Создать
            </button>
          )
        }
      />

      <div className="p-6 md:p-8 fade-in">
        <div className="mb-4 max-w-sm">
          <input
            className="input"
            placeholder="Поиск по логину или имени…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="card p-4 shimmer" style={{ height: 64 }} />
            ))}
          </div>
        ) : error ? (
          <div className="card p-6 text-center" style={{ color: 'var(--danger)' }}>{error}</div>
        ) : filtered.length === 0 ? (
          <div className="card p-10 text-center">
            <div className="text-text-3 text-3xl mb-3">◉</div>
            <h2 className="text-[15px] font-semibold">Никого не найдено</h2>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="table">
              <thead>
                <tr>
                  <th>Логин</th>
                  <th>Имя</th>
                  <th>Роль</th>
                  <th>Доступы</th>
                  <th>Статус</th>
                  <th>Последний вход</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const r = ROLE_META[u.role] || { label: u.role, tone: 'muted' };
                  const isMe = u.id === me?.id;
                  return (
                    <tr
                      key={u.id}
                      className="cursor-pointer"
                      onClick={() => setEditing(u)}
                    >
                      <td className="mono font-medium">
                        {u.username}
                        {isMe && <span className="ml-1.5 text-text-3 text-xs">(вы)</span>}
                      </td>
                      <td>{u.displayName}</td>
                      <td><span className={`pill pill-${r.tone}`}>{r.label}</span></td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {u.accesses.slice(0, 3).map((a) => (
                            <span key={a.id} className="pill pill-muted text-[10px]">
                              {a.scope === 'GLOBAL'
                                ? 'Все'
                                : a.scope === 'COUNTRY'
                                ? a.countryName
                                : a.cityName}
                            </span>
                          ))}
                          {u.accesses.length > 3 && (
                            <span className="text-text-3 text-xs">+{u.accesses.length - 3}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        {u.isActive ? (
                          <span className="pill pill-success">Активен</span>
                        ) : (
                          <span className="pill pill-danger">Отключён</span>
                        )}
                      </td>
                      <td className="mono text-xs text-text-3">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('ru-RU') : '—'}
                      </td>
                      <td className="text-text-3">›</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
