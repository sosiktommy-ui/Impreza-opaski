import { useEffect, useState } from 'react';
import Header from '../components/layout/Header';
import IntakeModal from '../components/domain/IntakeModal';
import { listByCity, listByCountry, COLORS } from '../api/inventory';
import { useAuthStore } from '../store/useAuthStore';

const COLOR_MAP = Object.fromEntries(COLORS.map((c) => [c.id, c]));

export default function Inventory() {
  const { user, currentAccess } = useAuthStore();
  const [view, setView] = useState('city'); // 'city' | 'country'
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [intakeOpen, setIntakeOpen] = useState(false);

  const canIntake = user?.role === 'ADMIN' || user?.role === 'OFFICE';
  const canSwitchView = currentAccess?.scope !== 'CITY';

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const fn = view === 'country' ? listByCountry : listByCity;
      const res = await fn();
      setData(res || []);
    } catch (e) {
      setError(e?.response?.data?.error?.message || 'LOAD_FAILED');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  return (
    <>
      <Header
        title="Склад"
        subtitle="Текущие остатки браслетов"
        right={
          canIntake && (
            <button className="btn btn-primary btn-sm" onClick={() => setIntakeOpen(true)}>
              + Поступление
            </button>
          )
        }
      />

      <div className="p-6 md:p-8 fade-in">
        {canSwitchView && (
          <div className="flex items-center gap-1 mb-5 p-1 inline-flex rounded-[10px]" style={{ background: 'var(--surface)' }}>
            <ViewTab active={view === 'city'} onClick={() => setView('city')}>По городам</ViewTab>
            <ViewTab active={view === 'country'} onClick={() => setView('country')}>По странам</ViewTab>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card p-5 shimmer" style={{ height: 160 }} />
            ))}
          </div>
        ) : error ? (
          <div className="card p-6 text-center" style={{ color: 'var(--danger)' }}>{error}</div>
        ) : data.length === 0 ? (
          <div className="card p-10 text-center">
            <div className="text-text-3 text-3xl mb-3">▦</div>
            <h2 className="text-[15px] font-semibold">Пока пусто</h2>
            <p className="text-text-2 text-sm mt-1">
              {canIntake ? 'Создайте первое поступление кнопкой выше.' : 'Поступления ещё не зафиксированы.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.map((row) => (
              <InventoryCard key={row.id || row.cityId || row.countryId} row={row} kind={view} />
            ))}
          </div>
        )}
      </div>

      <IntakeModal open={intakeOpen} onClose={() => setIntakeOpen(false)} onDone={refresh} />
    </>
  );
}

function ViewTab({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 text-sm rounded-md transition-colors"
      style={{
        background: active ? 'var(--surface-2)' : 'transparent',
        color: active ? 'var(--text)' : 'var(--text-2)',
      }}
    >
      {children}
    </button>
  );
}

function InventoryCard({ row, kind }) {
  const title = kind === 'country' ? row.countryName || row.name : row.cityName || row.name;
  const subtitle = kind === 'country' ? row.countryCode : row.countryCode;
  const items = row.byColor || row.colors || [];

  // Normalize: backend may return either { byColor: {BLACK: 12,...} } or [{color, count}]
  const normalized = Array.isArray(items)
    ? items
    : Object.entries(items).map(([color, count]) => ({ color, count }));

  const total = normalized.reduce((s, x) => s + (x.count || 0), 0);

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-text-3 font-semibold">
            {kind === 'country' ? 'Страна' : 'Город'}
          </div>
          <div className="text-[16px] font-semibold tracking-tight truncate">{title}</div>
          {subtitle && <div className="text-text-3 text-xs mono mt-0.5">{subtitle}</div>}
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-wider text-text-3 font-semibold">Всего</div>
          <div className="text-[20px] font-semibold tracking-tight mono">{total}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {COLORS.map((c) => {
          const found = normalized.find((x) => x.color === c.id);
          const count = found?.count || 0;
          return (
            <div
              key={c.id}
              className="flex items-center justify-between px-3 py-2 rounded-[10px]"
              style={{ background: 'var(--surface-2)' }}
            >
              <div className="flex items-center gap-2">
                <span className={`swatch ${c.sw}`} />
                <span className="text-xs text-text-2">{c.label}</span>
              </div>
              <span className="mono text-sm font-semibold">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
