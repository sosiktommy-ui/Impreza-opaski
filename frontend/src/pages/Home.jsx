import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/layout/Header';
import { useAuthStore } from '../store/useAuthStore';
import api, { unwrap } from '../api/axios';

export default function Home() {
  const { user, currentAccess } = useAuthStore();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/inventory/stats')
      .then((r) => setStats(unwrap(r)))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [currentAccess?.id]);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 6) return 'Доброй ночи';
    if (h < 12) return 'Доброе утро';
    if (h < 17) return 'Добрый день';
    return 'Добрый вечер';
  };

  const scopeLabel =
    currentAccess?.scope === 'GLOBAL'
      ? 'Все страны'
      : currentAccess?.scope === 'COUNTRY'
      ? currentAccess.countryName
      : currentAccess?.cityName || '—';

  return (
    <>
      <Header
        title={`${greeting()}, ${user?.displayName?.split(' ')[0] || user?.username || ''}`}
        subtitle={`Контекст: ${scopeLabel}`}
      />
      <div className="p-6 md:p-8 fade-in space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            loading={loading}
            label="Браслетов на складе"
            value={stats?.totalBracelets ?? '—'}
            icon="▦"
            tone="accent"
          />
          <StatCard
            loading={loading}
            label="Активных городов"
            value={stats?.totalCities ?? '—'}
            icon="◎"
          />
          <StatCard
            loading={loading}
            label="Ожидают приёмки"
            value={stats?.pendingTransfers ?? '—'}
            icon="⇄"
            tone={stats?.pendingTransfers > 0 ? 'warning' : undefined}
          />
          <StatCard
            loading={loading}
            label="Расхождений"
            value={stats?.discrepancies ?? '—'}
            icon="!"
            tone={stats?.discrepancies > 0 ? 'danger' : undefined}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-5">
            <div className="text-[10px] uppercase tracking-wider text-text-3 font-semibold mb-3">
              Профиль
            </div>
            <div className="space-y-2.5">
              <InfoRow label="Логин" value={user?.username} mono />
              <InfoRow label="Имя" value={user?.displayName} />
              <InfoRow label="Роль" value={user?.role} mono />
              <InfoRow
                label="Контекст"
                value={
                  currentAccess?.scope === 'GLOBAL'
                    ? 'Глобальный (все страны)'
                    : currentAccess?.scope === 'COUNTRY'
                    ? `Страна: ${currentAccess.countryName}`
                    : `Город: ${currentAccess.cityName}`
                }
              />
            </div>
          </div>
          <div className="card p-5">
            <div className="text-[10px] uppercase tracking-wider text-text-3 font-semibold mb-3">
              Быстрые действия
            </div>
            <div className="space-y-2">
              <QuickLink to="/transfers" icon="⇄" label="Передачи браслетов" />
              <QuickLink to="/inventory" icon="▦" label="Склад — остатки" />
              <QuickLink to="/expenses" icon="€" label="Расходы / списания" />
              <QuickLink to="/history" icon="⌛" label="История действий" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function StatCard({ label, value, icon, tone, loading }) {
  const toneColor = { accent: 'var(--accent)', warning: 'var(--warning)', danger: 'var(--danger)' }[tone] || 'var(--text-2)';
  const toneBg = { accent: 'color-mix(in srgb, var(--accent) 10%, transparent)', warning: 'color-mix(in srgb, var(--warning) 10%, transparent)', danger: 'color-mix(in srgb, var(--danger) 10%, transparent)' }[tone] || 'var(--surface-2)';
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-text-3 font-semibold leading-tight mb-2">
            {label}
          </div>
          {loading ? (
            <div className="shimmer rounded-md" style={{ width: 56, height: 28 }} />
          ) : (
            <div className="text-[26px] font-semibold tracking-tight mono" style={{ color: toneColor }}>
              {value}
            </div>
          )}
        </div>
        <div
          className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 text-sm"
          style={{ background: toneBg, color: toneColor }}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-text-3 text-xs">{label}</span>
      <span className={`text-sm font-medium truncate ${mono ? 'mono' : ''}`}>{value || '—'}</span>
    </div>
  );
}

function QuickLink({ to, icon, label }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(to)}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] transition-colors text-left"
      style={{ background: 'var(--surface-2)' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-3)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
    >
      <span className="text-text-3">{icon}</span>
      <span className="text-sm font-medium">{label}</span>
      <span className="ml-auto text-text-3 text-xs">›</span>
    </button>
  );
}
