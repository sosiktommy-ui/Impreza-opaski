import { useEffect, useMemo, useState } from 'react';
import Header from '../components/layout/Header';
import { listHistory, ACTION_META } from '../api/history';
import { useAuthStore } from '../store/useAuthStore';

export default function History() {
  const { user, currentAccess } = useAuthStore();
  const role = user?.role;

  const tabs = useMemo(() => {
    // Tab 1: scoped feed (always)
    // Tab 2: ADMIN/OFFICE see "country" cross-context; COUNTRY sees "country" too
    // Tab 3: ADMIN sees "all"; OFFICE sees "all"; MANAGER none
    const t = [];
    if (role === 'MANAGER') {
      t.push({ id: 'mine', label: 'Мои действия' });
      t.push({ id: 'city', label: 'Город' });
    } else if (role === 'COUNTRY') {
      t.push({ id: 'mine', label: 'Мои действия' });
      t.push({ id: 'country', label: 'Страна' });
    } else if (role === 'OFFICE') {
      t.push({ id: 'mine', label: 'Мои действия' });
      t.push({ id: 'country', label: 'По стране' });
      t.push({ id: 'all', label: 'Все события' });
    } else {
      // ADMIN
      t.push({ id: 'mine', label: 'Мои действия' });
      t.push({ id: 'country', label: 'По стране' });
      t.push({ id: 'all', label: 'Все события' });
    }
    return t;
  }, [role]);

  const [tab, setTab] = useState(tabs[0]?.id || 'mine');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <>
      <Header
        title="История"
        subtitle={`Журнал событий · ${currentAccess?.scope || ''}`}
      />

      <div className="p-6 md:p-8 fade-in">
        <div className="flex items-center gap-1 mb-5 p-1 inline-flex rounded-[10px]" style={{ background: 'var(--surface)' }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-3 py-1.5 text-sm rounded-md transition-colors"
              style={{
                background: tab === t.id ? 'var(--surface-2)' : 'transparent',
                color: tab === t.id ? 'var(--text)' : 'var(--text-2)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="card p-4 mb-4 text-center" style={{ color: 'var(--danger)' }}>
            {error}
          </div>
        )}

        {loading && items.length === 0 ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="card p-4 shimmer" style={{ height: 56 }} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="card p-10 text-center">
            <div className="text-text-3 text-3xl mb-3">⌛</div>
            <h2 className="text-[15px] font-semibold">Событий пока нет</h2>
          </div>
        ) : (
          <div className="space-y-1.5">
            {items.map((it) => (
              <HistoryRow key={it.id} item={it} />
            ))}
          </div>
        )}

        {hasMore && (
          <div className="flex justify-center mt-4">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => load(false)}
              disabled={loading}
            >
              {loading ? 'Загрузка…' : 'Загрузить ещё'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function HistoryRow({ item }) {
  const meta = ACTION_META[item.action] || { label: item.action, tone: 'muted' };
  const summary = formatPayload(item);

  return (
    <div
      className="px-4 py-3 rounded-[12px] flex items-start gap-3 hover:bg-surface-2 transition-colors"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <span className={`pill pill-${meta.tone} shrink-0`}>{meta.label}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{summary}</div>
        <div className="text-text-3 text-xs mt-0.5 mono">
          {new Date(item.createdAt).toLocaleString('ru-RU')}
          {item.actor && (
            <>
              {' · '}
              <span>{item.actor.displayName || item.actor.username}</span>
              <span className="ml-1 text-text-3">[{item.actor.role}]</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function formatPayload(it) {
  const p = it.payload || {};
  switch (it.action) {
    case 'INVENTORY_INTAKE':
      return `+${p.count ?? '?'} ${p.color ?? ''} → ${p.cityName ?? p.cityId ?? '—'}`;
    case 'TRANSFER_CREATED':
      return `${p.fromCityName ?? '?'} → ${p.toCityName ?? '?'} (${p.totalSent ?? '?'})`;
    case 'TRANSFER_ACCEPTED':
      return `Передача #${(it.entityId || '').slice(0, 6)} принята`;
    case 'TRANSFER_REJECTED':
      return `Передача #${(it.entityId || '').slice(0, 6)} отклонена`;
    case 'TRANSFER_DISCREPANCY':
      return `Передача #${(it.entityId || '').slice(0, 6)} — расхождение`;
    case 'TRANSFER_RESOLVED':
      return `Передача #${(it.entityId || '').slice(0, 6)} — закрыта`;
    case 'TRANSFER_CANCELLED':
      return `Передача #${(it.entityId || '').slice(0, 6)} отменена`;
    case 'EXPENSE_CREATED':
      return `${p.kind ?? ''} ${p.color ?? ''} −${p.count ?? '?'} (${p.cityName ?? '—'})${p.reason ? ` · ${p.reason}` : ''}`;
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
      return it.entityType ? `${it.entityType} #${(it.entityId || '').slice(0, 6)}` : '—';
  }
}
