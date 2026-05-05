import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { listByCity, COLORS } from '../api/inventory';
import { listHistory, ACTION_META } from '../api/history';

// Sparkline heights (random-ish visual only)
const SPARKS = [
  [30, 50, 40, 65, 55, 75, 90],
  [80, 75, 70, 60, 55, 50, 45],
  [35, 45, 50, 60, 70, 85, 100],
  [50, 55, 60, 65, 70, 75, 80],
];

export default function Home() {
  const { user, currentAccess } = useAuthStore();
  const navigate = useNavigate();
  const [inventory, setInventory] = useState([]);
  const [feed, setFeed] = useState([]);
  const [loadingInv, setLoadingInv] = useState(true);
  const [loadingFeed, setLoadingFeed] = useState(true);

  useEffect(() => {
    listByCity()
      .then((rows) => setInventory(rows || []))
      .catch(() => {})
      .finally(() => setLoadingInv(false));

    listHistory({ tab: 'all', limit: 6 })
      .then((res) => setFeed(res?.items || []))
      .catch(() => {})
      .finally(() => setLoadingFeed(false));
  }, [currentAccess?.id]);

  // Aggregate per color across all cities
  const colorTotals = COLORS.map((c) => {
    const total = inventory.reduce((sum, row) => {
      const byColor = row.byColor || row.colors || {};
      const val = Array.isArray(byColor)
        ? (byColor.find((x) => x.color === c.id)?.count || 0)
        : (byColor[c.id] || 0);
      return sum + val;
    }, 0);
    return { ...c, total };
  });

  const scopeLabel =
    currentAccess?.scope === 'GLOBAL'
      ? 'Все страны'
      : currentAccess?.scope === 'COUNTRY'
      ? currentAccess.countryName
      : currentAccess?.cityName || '—';

  const today = new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // Per-color visual config
  const COLOR_THEME = {
    BLACK: {
      gradient: 'linear-gradient(135deg, #1a1a24 0%, #0a0a0d 100%)',
      glow: 'rgba(139,92,246,0.18)',
      bar: 'linear-gradient(180deg,#a78bfa,rgba(139,92,246,0.2))',
      label: '#c4b5fd',
      border: 'rgba(139,92,246,0.25)',
      icon: '⬛',
    },
    WHITE: {
      gradient: 'linear-gradient(135deg, #f0f0ec 0%, #d4d4d8 100%)',
      glow: 'rgba(212,212,216,0.18)',
      bar: 'linear-gradient(180deg,#71717a,rgba(113,113,122,0.2))',
      label: '#52525b',
      border: 'rgba(161,161,170,0.4)',
      icon: '⬜',
    },
    RED: {
      gradient: 'linear-gradient(135deg, #3b0a0a 0%, #1c0505 100%)',
      glow: 'rgba(239,68,68,0.2)',
      bar: 'linear-gradient(180deg,#f87171,rgba(239,68,68,0.2))',
      label: '#fca5a5',
      border: 'rgba(239,68,68,0.3)',
      icon: '🔴',
    },
    BLUE: {
      gradient: 'linear-gradient(135deg, #0a1a3b 0%, #05101c 100%)',
      glow: 'rgba(59,130,246,0.2)',
      bar: 'linear-gradient(180deg,#60a5fa,rgba(59,130,246,0.2))',
      label: '#93c5fd',
      border: 'rgba(59,130,246,0.3)',
      icon: '🔵',
    },
  };

  return (
    <div className="px-7 py-7 max-w-[1320px] mx-auto space-y-6 fade-in">
      {/* 4 color bracelet cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {COLORS.map((c, i) => {
          const total = loadingInv ? null : colorTotals[i].total;
          const theme = COLOR_THEME[c.id] || COLOR_THEME.BLACK;
          return (
            <div
              key={c.id}
              className="relative overflow-hidden rounded-[16px] p-5"
              style={{
                background: theme.gradient,
                border: `1px solid ${theme.border}`,
                boxShadow: `0 0 32px ${theme.glow}`,
              }}
            >
              {/* Glow blob */}
              <div
                className="absolute -top-6 -right-6 rounded-full opacity-30 pointer-events-none"
                style={{ width: 80, height: 80, background: theme.glow, filter: 'blur(20px)' }}
              />
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-widest" style={{ color: theme.label }}>
                  <span className={`swatch sw-lg ${c.sw}`} />
                  {c.label}
                </div>
                <span className="text-[18px] opacity-70">{theme.icon}</span>
              </div>
              {loadingInv ? (
                <div className="shimmer rounded-md" style={{ width: 80, height: 30 }} />
              ) : (
                <div className="num-xl mono" style={{ color: '#fff' }}>{total?.toLocaleString('ru-RU') || '0'}</div>
              )}
              <div className="flex items-end gap-0.5 mt-3" style={{ height: 28 }}>
                {SPARKS[i].map((h, j) => (
                  <div key={j} className="flex-1 rounded-sm" style={{ height: `${h}%`, background: theme.bar, minHeight: 4 }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Feed + sidebar */}
      <div className="grid lg:grid-cols-3 gap-5">
        {/* Activity feed */}
        <div className="lg:col-span-2 card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: 'var(--border)' }}>
            <div>
              <h3 className="font-semibold text-[14px]">Последние операции</h3>
              <p className="text-[11.5px] mt-0.5" style={{ color: 'var(--text-3)' }}>
                Сводка · {scopeLabel} · {today}
              </p>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/history')}>
              Открыть историю
            </button>
          </div>
          <ul>
            {loadingFeed ? (
              Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="px-5 py-3.5 border-t" style={{ borderColor: 'var(--border)' }}>
                  <div className="shimmer rounded-md" style={{ height: 20 }} />
                </li>
              ))
            ) : feed.length === 0 ? (
              <li className="px-5 py-8 text-center" style={{ color: 'var(--text-3)' }}>
                <div className="text-sm">Пока нет операций</div>
              </li>
            ) : (
              feed.map((item, i) => {
                const meta = ACTION_META[item.action] || { label: item.action, tone: 'muted' };
                const tone = meta.tone;
                const pillClass = `pill-${tone === 'accent' ? 'accent' : tone === 'success' ? 'success' : tone === 'warning' ? 'warning' : tone === 'danger' ? 'danger' : 'muted'}`;
                const iconBg = tone === 'success' ? 'pill-success' : tone === 'warning' ? 'pill-warning' : tone === 'danger' ? 'pill-danger' : tone === 'accent' ? 'pill-accent' : 'pill-muted';
                const time = new Date(item.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                return (
                  <li
                    key={item.id || i}
                    className="flex items-center gap-3 px-5 py-3.5 transition"
                    style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}
                  >
                    <div className={`w-8 h-8 rounded-lg grid place-items-center ${iconBg}`} style={{ padding: 0 }}>
                      <FeedIcon action={item.action} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] truncate">
                        {meta.label}
                        {item.meta?.cityName && <span className="font-semibold"> · {item.meta.cityName}</span>}
                        {item.meta?.fromCity && item.meta?.toCity && (
                          <span className="font-semibold"> {item.meta.fromCity} → {item.meta.toCity}</span>
                        )}
                      </div>
                      <div className="text-[12px] mt-0.5" style={{ color: 'var(--text-3)' }}>
                        {item.actor?.displayName || item.actor?.username || '—'}
                      </div>
                    </div>
                    <span className="mono text-[12px]" style={{ color: 'var(--text-3)', flexShrink: 0 }}>{time}</span>
                  </li>
                );
              })
            )}
          </ul>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Top cities */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-[13.5px]">Инвентарь по городам</h3>
              <span className="text-[11.5px]" style={{ color: 'var(--text-3)' }}>итого</span>
            </div>
            {loadingInv ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <div key={i} className="shimmer rounded-md" style={{ height: 18 }} />)}
              </div>
            ) : inventory.length === 0 ? (
              <div className="text-[12px]" style={{ color: 'var(--text-3)' }}>Нет данных</div>
            ) : (
              <div className="space-y-3.5">
                {inventory.slice(0, 5).map((row) => {
                  const byColor = row.byColor || row.colors || {};
                  const total = Array.isArray(byColor)
                    ? byColor.reduce((s, x) => s + (x.count || 0), 0)
                    : Object.values(byColor).reduce((s, v) => s + (v || 0), 0);
                  const maxTotal = Math.max(...inventory.map((r) => {
                    const bc = r.byColor || r.colors || {};
                    return Array.isArray(bc)
                      ? bc.reduce((s, x) => s + (x.count || 0), 0)
                      : Object.values(bc).reduce((s, v) => s + (v || 0), 0);
                  }), 1);
                  const pct = Math.round((total / maxTotal) * 100);
                  return (
                    <div key={row.id || row.cityId}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="text-[13px]">{row.cityName || row.name}</div>
                        <span className="mono text-[12px]" style={{ color: 'var(--text-2)' }}>{total.toLocaleString('ru-RU')}</span>
                      </div>
                      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick action */}
          <button
            className="card p-4 w-full text-left flex items-center gap-3 transition"
            style={{ cursor: 'pointer' }}
            onClick={() => navigate('/transfers')}
          >
            <div className="w-9 h-9 rounded-lg grid place-items-center" style={{ background: 'var(--accent)', color: '#fff', flexShrink: 0 }}>
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M17 3l4 4-4 4M21 7H9M7 21l-4-4 4-4M3 17h12"/>
              </svg>
            </div>
            <div className="flex-1">
              <div className="text-[13.5px] font-semibold">Создать перевод</div>
              <div className="text-[11.5px]" style={{ color: 'var(--text-3)' }}>Между городами или со склада</div>
            </div>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ color: 'var(--text-3)', flexShrink: 0 }}>
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </button>

          {/* User info */}
          <div className="card p-5">
            <div className="text-[10px] uppercase tracking-[0.08em] font-semibold mb-3" style={{ color: 'var(--text-3)' }}>Сессия</div>
            <div className="space-y-2.5">
              <InfoRow label="Логин" value={user?.username} mono />
              <InfoRow label="Роль" value={user?.role} />
              <InfoRow label="Контекст" value={scopeLabel} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12px]" style={{ color: 'var(--text-3)' }}>{label}</span>
      <span className={`text-[13px] font-medium truncate ${mono ? 'mono' : ''}`} style={{ color: 'var(--text-2)' }}>{value || '—'}</span>
    </div>
  );
}

function FeedIcon({ action }) {
  if (action?.includes('ACCEPTED') || action?.includes('LOGIN'))
    return <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>;
  if (action?.includes('DISCREPANCY') || action?.includes('REJECTED'))
    return <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01"/></svg>;
  if (action?.includes('INTAKE') || action?.includes('CREATED'))
    return <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>;
  if (action?.includes('EXPENSE'))
    return <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>;
  return <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
}
