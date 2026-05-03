import { useEffect, useMemo, useState } from 'react';
import Header from '../components/layout/Header';
import { listHistory, ACTION_META } from '../api/history';
import { useAuthStore } from '../store/useAuthStore';

export default function History() {
  const { user, currentAccess } = useAuthStore();
  const role = user?.role;

  const tabs = useMemo(() => {
    if (role === 'MANAGER') return [{ id: 'mine', label: 'Мои действия' }, { id: 'city', label: 'Город' }];
    if (role === 'COUNTRY') return [{ id: 'mine', label: 'Мои действия' }, { id: 'country', label: 'Страна' }];
    return [{ id: 'mine', label: 'Мои действия' }, { id: 'country', label: 'По стране' }, { id: 'all', label: 'Все события' }];
  }, [role]);

  const [tab, setTab] = useState(tabs[0]?.id || 'mine');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [search, setSearch] = useState('');

  async function load(reset = true) {
    setLoading(true);
    setError(null);
    try {
      const params = { tab, limit: 50 };
      if (!reset && cursor) params.cursor = cursor;
      const res = await listHistory(params);
      const next = reset ? res.items : [...items, ...res.items];
      setItems(next);
      setHasMore(!!res.hasMore);
      setCursor(res.nextCursor || null);
    } catch (e) {
      setError(e?.response?.data?.error?.message || 'LOAD_FAILED');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setCursor(null);
    load(true);
  }, [tab]); // eslint-disable-line

  const filtered = search
    ? items.filter((it) => {
        const text = [
          ACTION_META[it.action]?.label,
          it.actor?.displayName,
          it.actor?.username,
          formatPayload(it),
        ].join(' ').toLowerCase();
        return text.includes(search.toLowerCase());
      })
    : items;

  return (
    <>
      <Header
        title="История"
        subtitle={`Журнал событий · ${currentAccess?.scope || ''}`}
      />

      <div className="px-7 py-7 max-w-[1320px] mx-auto fade-in">
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="seg">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`seg-btn ${tab === t.id ? 'active' : ''}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative ml-auto" style={{ width: 320 }}>
            <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ color: 'var(--text-3)' }}>
              <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              className="input pl-9"
              placeholder="Поиск по описанию, пользователю..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <div className="card p-4 mb-4 text-center" style={{ color: 'var(--danger)' }}>{error}</div>
        )}

        {loading && items.length === 0 ? (
          <div className="card overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="shimmer" style={{ height: 48, borderTop: i > 0 ? '1px solid var(--border)' : undefined }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-10 text-center">
            <h2 className="text-[15px] font-semibold">Событий пока нет</h2>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="th" style={{ gridTemplateColumns: '110px 150px 1fr 180px 110px' }}>
              <span>Время</span>
              <span>Тип</span>
              <span>Описание</span>
              <span>Пользователь</span>
              <span className="text-right">Статус</span>
            </div>
            {filtered.map((it) => {
              const meta = ACTION_META[it.action] || { label: it.action, tone: 'muted' };
              const summary = formatPayload(it);
              const time = new Date(it.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
              const date = new Date(it.createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
              const initials = (it.actor?.displayName || it.actor?.username || '?')
                .split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
              return (
                <div key={it.id} className="tr" style={{ gridTemplateColumns: '110px 150px 1fr 180px 110px' }}>
                  <span className="mono text-[12.5px]" style={{ color: 'var(--text-3)' }}>
                    <div>{time}</div>
                    <div style={{ fontSize: 10, marginTop: 1 }}>{date}</div>
                  </span>
                  <span className="flex items-center gap-2" style={{ color: 'var(--text-2)' }}>
                    <span className={`w-5 h-5 rounded grid place-items-center pill-${meta.tone}`} style={{ padding: 0, flexShrink: 0 }}>
                      <ActionIcon action={it.action} />
                    </span>
                    <span className="text-[12.5px] truncate">{meta.label}</span>
                  </span>
                  <span className="text-[13px] truncate" style={{ color: 'var(--text-2)' }}>{summary}</span>
                  <span className="flex items-center gap-2">
                    <span
                      className="avatar"
                      style={{
                        width: 22, height: 22, fontSize: 10, borderRadius: 5,
                        background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
                      }}
                    >
                      {initials}
                    </span>
                    <span className="text-[13px] truncate" style={{ color: 'var(--text-2)' }}>
                      {it.actor?.displayName || it.actor?.username || '—'}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className={`pill pill-${meta.tone}`}>{meta.label.split(' ')[0]}</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between mt-4 text-[12.5px]" style={{ color: 'var(--text-3)' }}>
          <span>Показано {filtered.length} записей</span>
          {hasMore && (
            <button className="btn btn-secondary btn-sm" onClick={() => load(false)} disabled={loading}>
              {loading ? 'Загрузка…' : 'Загрузить ещё'}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function ActionIcon({ action }) {
  if (action?.includes('ACCEPTED') || action?.includes('LOGIN'))
    return <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>;
  if (action?.includes('DISCREPANCY') || action?.includes('REJECTED') || action?.includes('DELETED'))
    return <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01"/></svg>;
  if (action?.includes('INTAKE') || action?.includes('CREATED') || action?.includes('GRANTED'))
    return <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>;
  if (action?.includes('EXPENSE'))
    return <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>;
  if (action?.includes('USER'))
    return <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z"/></svg>;
  return <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/></svg>;
}

function formatPayload(it) {
  const p = it.payload || {};
  switch (it.action) {
    case 'INVENTORY_INTAKE':
      return `+${p.count ?? '?'} ${p.color ?? ''} → ${p.cityName ?? p.cityId ?? '—'}`;
    case 'TRANSFER_CREATED':
      return `${p.fromCityName ?? '?'} → ${p.toCityName ?? '?'} (${p.totalSent ?? '?'})`;
    case 'TRANSFER_ACCEPTED':
      return `Передача #${(it.entityId || '').slice(0, 7)} принята`;
    case 'TRANSFER_REJECTED':
      return `Передача #${(it.entityId || '').slice(0, 7)} отклонена`;
    case 'TRANSFER_DISCREPANCY':
      return `Передача #${(it.entityId || '').slice(0, 7)} — расхождение`;
    case 'TRANSFER_RESOLVED':
      return `Передача #${(it.entityId || '').slice(0, 7)} — закрыта`;
    case 'TRANSFER_CANCELLED':
      return `Передача #${(it.entityId || '').slice(0, 7)} отменена`;
    case 'EXPENSE_CREATED':
      return `${p.kind ?? ''} ${p.color ?? ''} −${p.count ?? '?'} · ${p.cityName ?? '—'}${p.reason ? ` · ${p.reason}` : ''}`;
    case 'EXPENSE_DELETED':
      return `Расход удалён`;
    case 'USER_CREATED':
      return `Создан: ${p.username ?? p.displayName ?? it.entityId}`;
    case 'USER_UPDATED':
      return `Изменён: ${p.username ?? it.entityId}`;
    case 'USER_DELETED':
      return `Удалён: ${p.username ?? it.entityId}`;
    case 'ACCESS_GRANTED':
      return `Доступ выдан: ${p.scope ?? ''} ${p.cityName ?? p.countryName ?? ''}`;
    case 'ACCESS_REVOKED':
      return `Доступ отозван: ${p.scope ?? ''} ${p.cityName ?? p.countryName ?? ''}`;
    case 'AUTH_LOGIN':
      return 'Вход в систему';
    case 'AUTH_LOGOUT':
      return 'Выход из системы';
    default:
      return it.entityType ? `${it.entityType} #${(it.entityId || '').slice(0, 7)}` : '—';
  }
}
