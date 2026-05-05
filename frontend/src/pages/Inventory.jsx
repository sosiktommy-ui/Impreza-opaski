import { useEffect, useState } from 'react';
import Header from '../components/layout/Header';
import IntakeModal from '../components/domain/IntakeModal';
import { listByCity, listByCountry, COLORS } from '../api/inventory';
import { useAuthStore } from '../store/useAuthStore';

// Sparkline heights per row (deterministic from index)
function sparks(seed) {
  const vals = [];
  let v = ((seed * 1234567) & 0xfffff);
  for (let i = 0; i < 7; i++) {
    v = ((v * 6364136223846793 + 1442695040888963407) >>> 0) % 100;
    vals.push(Math.max(20, v));
  }
  return vals;
}

const COLS = 'grid-template-columns: 2fr 1fr 1fr 1fr 1fr 1fr 110px;';

export default function Inventory() {
  const { user, currentAccess } = useAuthStore();
  const [view, setView] = useState('city');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
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
      setError(e?.response?.data?.error?.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [view]); // eslint-disable-line

  const filtered = search
    ? data.filter((r) => {
        const name = (r.cityName || r.countryName || r.name || '').toLowerCase();
        return name.includes(search.toLowerCase());
      })
    : data;

  // Grand totals
  const grand = COLORS.map((c) => {
    return filtered.reduce((sum, row) => {
      const byColor = row.byColor || row.colors || {};
      const val = Array.isArray(byColor)
        ? (byColor.find((x) => x.color === c.id)?.count || 0)
        : (byColor[c.id] || 0);
      return sum + val;
    }, 0);
  });
  const grandTotal = grand.reduce((s, v) => s + v, 0);

  return (
    <>
      <Header
        title="Баланс"
        subtitle="Браслеты по городам · все цвета"
      />

      <div className="px-7 py-7 max-w-[1320px] mx-auto fade-in">
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          {canSwitchView && (
            <div className="seg">
              <button className={`seg-btn ${view === 'city' ? 'active' : ''}`} onClick={() => setView('city')}>По городам</button>
              <button className={`seg-btn ${view === 'country' ? 'active' : ''}`} onClick={() => setView('country')}>По странам</button>
            </div>
          )}
          <div className="relative" style={{ width: 280 }}>
            <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ color: 'var(--text-3)' }}>
              <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              className="input pl-9"
              placeholder="Поиск города или страны..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {canIntake && (
            <button className="btn btn-primary ml-auto" onClick={() => setIntakeOpen(true)}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
              Поступление
            </button>
          )}
        </div>

        {loading ? (
          <div className="card overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="shimmer" style={{ height: 48, margin: '1px 0' }} />
            ))}
          </div>
        ) : error ? (
          <div className="card p-6 text-center" style={{ color: 'var(--danger)' }}>{error}</div>
        ) : filtered.length === 0 ? (
          <div className="card p-10 text-center">
            <h2 className="text-[15px] font-semibold">Пусто</h2>
            <p className="text-[13px] mt-1" style={{ color: 'var(--text-2)' }}>
              {canIntake ? 'Создайте первое поступление.' : 'Поступления ещё не зафиксированы.'}
            </p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="th" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr 110px' }}>
              <span>{view === 'country' ? 'Страна' : 'Город'}</span>
              {COLORS.map((c) => (
                <span key={c.id} className="flex items-center gap-1.5">
                  <span className={`swatch ${c.sw}`} />{c.label}
                </span>
              ))}
              <span>Всего</span>
              <span className="text-right">7 дней</span>
            </div>

            {filtered.map((row, idx) => {
              const byColor = row.byColor || row.colors || {};
              const counts = COLORS.map((c) => {
                return Array.isArray(byColor)
                  ? (byColor.find((x) => x.color === c.id)?.count || 0)
                  : (byColor[c.id] || 0);
              });
              const total = counts.reduce((s, v) => s + v, 0);
              const sp = sparks(idx + 1);
              const name = view === 'country'
                ? (row.countryName || row.name)
                : (row.cityName || row.name);
              const sub = row.countryName && view === 'city' ? row.countryName : row.countryCode;

              return (
                <div key={row.id || row.cityId || row.countryId || idx} className="tr" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr 110px' }}>
                  <span className="flex items-center gap-2.5">
                    <span className="font-medium">{name}</span>
                    {sub && <span className="text-[12px]" style={{ color: 'var(--text-3)' }}>{sub}</span>}
                  </span>
                  {counts.map((v, i) => (
                    <span key={i} className="mono">{v.toLocaleString('ru-RU')}</span>
                  ))}
                  <span className="mono font-semibold">{total.toLocaleString('ru-RU')}</span>
                  <span className="flex items-end gap-0.5 justify-end" style={{ height: 20 }}>
                    {sp.map((h, j) => (
                      <span key={j} className="bar" style={{ width: 5, height: `${h}%` }} />
                    ))}
                  </span>
                </div>
              );
            })}

            {/* Totals row */}
            <div className="tr" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr 110px', background: 'var(--surface-2)' }}>
              <span className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-3)' }}>Итого</span>
              {grand.map((v, i) => <span key={i} className="mono font-semibold">{v.toLocaleString('ru-RU')}</span>)}
              <span className="mono font-semibold">{grandTotal.toLocaleString('ru-RU')}</span>
              <span />
            </div>
          </div>
        )}
      </div>

      <IntakeModal open={intakeOpen} onClose={() => setIntakeOpen(false)} onDone={refresh} />
    </>
  );
}
