import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { inventoryApi } from '../api/inventory';
import { transfersApi } from '../api/transfers';
import { usersApi } from '../api/users';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import BraceletBadge from '../components/ui/BraceletBadge';
import BraceletCard from '../components/ui/BraceletCard';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import {
  Send, PackageCheck, Globe, MapPin,
  ArrowRight, Activity,
  CalendarDays, Boxes, Eye, AlertTriangle,
} from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [balance, setBalance] = useState(null);
  const [pending, setPending] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [problematicCount, setProblematicCount] = useState(0);
  const [stats, setStats] = useState({ countries: 0, cities: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const isAdminOrOffice = user.role === 'ADMIN' || user.role === 'OFFICE';
      const promises = [
        transfersApi.getAll({ limit: 200 }),
        transfersApi.getPending(),
        usersApi.getCountries(),
        transfersApi.getProblematic({ page: 1, limit: 1 }),
      ];

      if (isAdminOrOffice) {
        // Admin/Office — load all inventory to compute system totals
        promises.push(inventoryApi.getAll());
      } else {
        const entityType = user.role === 'COUNTRY' ? 'COUNTRY' : 'CITY';
        const entityId = user.role === 'COUNTRY' ? user.countryId : user.cityId;
        promises.push(inventoryApi.getBalance(entityType, entityId));
      }

      const results = await Promise.all(promises);

      // All transfers
      const allData = results[0].data;
      const allPayload = allData?.data || allData;
      const allTransfers = Array.isArray(allPayload) ? allPayload : (allPayload?.items || []);
      setTransfers(allTransfers);

      // Pending incoming
      const pendData = results[1].data;
      const pendPayload = pendData?.data || pendData;
      setPending(Array.isArray(pendPayload) ? pendPayload : []);

      // Countries & cities count (now role-filtered from backend)
      const countriesData = results[2].data;
      const countriesPayload = countriesData?.data || countriesData;
      const countriesList = Array.isArray(countriesPayload) ? countriesPayload : [];
      const totalCities = countriesList.reduce((sum, c) => sum + (c.cities?.length || 0), 0);
      setStats({ countries: countriesList.length, cities: totalCities });

      // Problematic count
      const probData = results[3].data;
      const probPayload = probData?.data || probData;
      setProblematicCount(probData?.meta?.total || probPayload?.meta?.total || (Array.isArray(probPayload) ? probPayload.length : 0));

      // Balance
      if (results[4]) {
        const d = results[4].data;
        const dPayload = d?.data || d;
        const VALID_TYPES = ['BLACK', 'WHITE', 'RED', 'BLUE'];

        if (isAdminOrOffice && Array.isArray(dPayload)) {
          // Aggregate all inventory records into system totals
          const totals = { BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 };
          dPayload.forEach((inv) => {
            if (totals[inv.itemType] !== undefined) {
              totals[inv.itemType] += inv.quantity || 0;
            }
          });
          setBalance(Object.entries(totals).map(([itemType, quantity]) => ({ itemType, quantity })));
        } else if (dPayload && typeof dPayload === 'object' && !Array.isArray(dPayload)) {
          setBalance(
            Object.entries(dPayload)
              .filter(([key]) => VALID_TYPES.includes(key))
              .map(([itemType, quantity]) => ({ itemType, quantity: Number(quantity) || 0 }))
          );
        } else {
          setBalance(Array.isArray(dPayload) ? dPayload : []);
        }
      }
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  const entityLabel =
    user.role === 'ADMIN' ? 'Администратор' :
    user.role === 'OFFICE' ? (user.office?.name || 'Офис') :
    user.role === 'COUNTRY' ? (user.country?.name || 'Страна') :
    (user.city?.name || 'Город');

  const statusCounts = {};
  transfers.forEach((t) => { statusCounts[t.status] = (statusCounts[t.status] || 0) + 1; });

  const recentTransfers = [...transfers]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  const quickActions = [
    { label: 'Новая отправка', icon: Send, path: '/transfers', color: 'bg-blue-500', roles: ['ADMIN', 'OFFICE', 'COUNTRY'] },
    { label: 'Вернуть опаски', icon: Send, path: '/transfers', color: 'bg-blue-500', roles: ['CITY'] },
    { label: 'Получение', icon: PackageCheck, path: '/acceptance', color: 'bg-green-500', roles: ['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'] },
    { label: 'Проблемные', icon: AlertTriangle, path: '/problematic', color: 'bg-orange-500', roles: ['ADMIN', 'OFFICE'] },
    { label: 'Мероприятия', icon: CalendarDays, path: '/expenses', color: 'bg-purple-500', roles: ['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'] },
    { label: 'Остатки', icon: Boxes, path: '/inventory', color: 'bg-amber-500', roles: ['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'] },
    { label: 'Обзор', icon: Eye, path: '/overview', color: 'bg-teal-500', roles: ['ADMIN', 'OFFICE', 'COUNTRY'] },
  ].filter((a) => a.roles.includes(user.role));

  return (
    <div className="space-y-4">
      {/* ── Gradient Header ──────────────────────────── */}
      <div className="bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 rounded-[var(--radius-md)] p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Привет, {user.displayName}!
            </h1>
            <p className="text-white/60 mt-1 text-sm flex items-center gap-1.5">
              {(user.role === 'ADMIN' || user.role === 'OFFICE') ? <Globe size={14} /> : <MapPin size={14} />}
              {entityLabel}
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-[var(--radius-sm)] px-4 py-3">
            <Activity size={22} className="text-white/60" />
            <div>
              <div className="text-xl font-bold">{transfers.length}</div>
              <div className="text-[11px] text-white/50 leading-tight">отправок</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats Grid ───────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { value: transfers.length, label: 'Отправки', icon: Send, iconColor: 'text-blue-400', bg: 'bg-blue-500/10' },
          { value: problematicCount, label: 'Проблемные', icon: AlertTriangle, iconColor: 'text-orange-400', bg: 'bg-orange-500/10', tooltip: (user.role === 'CITY' || user.role === 'COUNTRY') ? 'Если есть проблемные отправки — обратитесь к администратору или офису для решения' : null },
          { value: stats.countries, label: 'Стран', icon: Globe, iconColor: 'text-violet-400', bg: 'bg-violet-500/10' },
          { value: stats.cities, label: 'Городов', icon: MapPin, iconColor: 'text-amber-400', bg: 'bg-amber-500/10' },
        ].map(({ value, label, icon: Icon, iconColor, bg, tooltip }) => (
          <div key={label} className="bg-surface-card rounded-[var(--radius-md)] border border-edge p-4 hover:border-edge/80 transition-colors" title={tooltip || undefined} style={tooltip ? { cursor: 'help' } : undefined}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-[var(--radius-sm)] ${bg} flex items-center justify-center flex-shrink-0`}>
                <Icon size={18} className={iconColor} />
              </div>
              <div>
                <div className="text-2xl font-bold text-content-primary">{value}</div>
                <div className="text-xs text-content-muted">{label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Balance (non-admin) ──────────────────────── */}
      {balance && balance.length > 0 && (
        <Card
          title={
            (user.role === 'ADMIN' || user.role === 'OFFICE')
              ? 'Общий баланс системы'
              : 'Текущий остаток'
          }
          action={
            <button
              onClick={() => navigate('/inventory')}
              className="text-xs text-brand-500 hover:text-brand-400 flex items-center gap-1"
            >
              Подробнее <ArrowRight size={12} />
            </button>
          }
        >
          {(() => {
            const total = balance.reduce((s, b) => s + (b.quantity || 0), 0);
            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {['BLACK', 'WHITE', 'RED', 'BLUE'].map((type) => {
                  const qty = balance.find((b) => b.itemType === type)?.quantity || 0;
                  return <BraceletCard key={type} type={type} quantity={qty} total={total} />;
                })}
              </div>
            );
          })()}
        </Card>
      )}

      {/* ── Pending Incoming ─────────────────────────── */}
      {pending.length > 0 && (
        <div className="bg-amber-500/5 rounded-[var(--radius-md)] border border-amber-500/20 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-amber-500/10">
            <h3 className="font-semibold text-amber-400 flex items-center gap-2">
              <PackageCheck size={16} />
              Ожидают получения ({pending.length})
            </h3>
            <button
              onClick={() => navigate('/acceptance')}
              className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium"
            >
              Открыть <ArrowRight size={12} />
            </button>
          </div>
          <div className="p-4 space-y-2">
            {pending.slice(0, 3).map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between p-3 bg-surface-card rounded-[var(--radius-sm)] border border-edge"
              >
                <div>
                  <div className="text-sm font-medium text-content-primary">
                    От: {t.senderType === 'ADMIN'
                      ? 'Склад'
                      : t.senderType === 'CITY'
                        ? `${t.senderCity?.name || '—'}${t.senderCity?.country?.name ? ` (${t.senderCity.country.name})` : ''}`
                        : (t.senderCountry?.name || 'Отправитель')}
                  </div>
                  {t.createdByUser?.displayName && (
                    <div className="text-[10px] text-content-muted">
                      {t.createdByUser.displayName}
                    </div>
                  )}
                  <div className="text-xs text-content-muted mt-0.5">
                    Пересчитайте и примите
                  </div>
                </div>
                <Badge status={t.status} />
              </div>
            ))}
            {pending.length > 3 && (
              <button
                onClick={() => navigate('/acceptance')}
                className="w-full text-center text-xs text-amber-400 hover:text-amber-300 py-2"
              >
                Ещё {pending.length - 3} отправок →
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Quick Actions ────────────────────────────── */}
      <div>
        <h3 className="text-2xs font-semibold text-content-muted uppercase tracking-widest mb-3">
          Быстрые действия
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={() => navigate(action.path)}
              className="group bg-surface-card rounded-[var(--radius-md)] border border-edge p-4 text-left hover:border-edge/80 transition-all"
            >
              <div
                className={`w-10 h-10 ${action.color} rounded-[var(--radius-sm)] flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}
              >
                <action.icon size={20} className="text-white" />
              </div>
              <div className="text-sm font-medium text-content-primary">
                {action.label}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Status Breakdown + Recent ────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Status breakdown */}
        <Card title="Статусы отправок">
          {transfers.length === 0 ? (
            <p className="text-sm text-content-muted text-center py-4">Нет данных</p>
          ) : (
            (() => {
              const statuses = [
                { key: 'SENT', label: 'Отправлено', color: 'bg-yellow-400', hex: '#facc15' },
                { key: 'ACCEPTED', label: 'Принято', color: 'bg-green-400', hex: '#4ade80' },
                { key: 'DISCREPANCY_FOUND', label: 'Расхождение', color: 'bg-orange-400', hex: '#fb923c' },
                { key: 'REJECTED', label: 'Отклонено', color: 'bg-red-400', hex: '#f87171' },
                { key: 'CANCELLED', label: 'Отменено', color: 'bg-gray-500', hex: '#6b7280' },
              ].filter(({ key }) => (statusCounts[key] || 0) > 0);

              let angle = 0;
              const segments = statuses.map((s) => {
                const pct = ((statusCounts[s.key] || 0) / transfers.length) * 100;
                const from = angle;
                angle += pct;
                return `${s.hex} ${from}% ${angle}%`;
              });
              const gradient = `conic-gradient(${segments.join(', ')})`;

              return (
                <div className="flex gap-4 items-center">
                  <div className="relative flex-shrink-0">
                    <div
                      className="w-20 h-20 rounded-full"
                      style={{ background: gradient }}
                    />
                    <div className="absolute inset-2 rounded-full bg-surface-card flex items-center justify-center">
                      <span className="text-sm font-bold text-content-primary">{transfers.length}</span>
                    </div>
                  </div>
                  <div className="flex-1 space-y-1.5">
                    {statuses.map(({ key, label, color }) => {
                      const count = statusCounts[key] || 0;
                      const pct = Math.round((count / transfers.length) * 100);
                      return (
                        <div key={key} className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${color} flex-shrink-0`} />
                          <span className="text-xs text-content-secondary flex-1">{label}</span>
                          <span className="text-xs font-semibold text-content-primary tabular-nums">
                            {count}
                          </span>
                          <span className="text-[10px] text-content-muted w-8 text-right tabular-nums">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()
          )}
        </Card>

        {/* Recent transfers */}
        <Card
          title="Последние отправки"
          action={
            <button
              onClick={() => navigate('/transfers')}
              className="text-xs text-brand-500 hover:text-brand-400 flex items-center gap-1"
            >
              Все <ArrowRight size={12} />
            </button>
          }
        >
          {recentTransfers.length === 0 ? (
            <p className="text-sm text-content-muted text-center py-4">Нет отправок</p>
          ) : (
            <div className="space-y-1">
              {recentTransfers.map((t) => {
                const from =
                  t.senderType === 'ADMIN'
                    ? 'Склад'
                    : t.senderType === 'CITY'
                      ? `${t.senderCity?.name || '—'}${t.senderCity?.country?.name ? ` (${t.senderCity.country.name})` : ''}`
                      : (t.senderCountry?.name || '—');
                const to =
                  t.receiverType === 'CITY'
                    ? `${t.receiverCity?.name || '—'}${t.receiverCity?.country?.name ? ` (${t.receiverCity.country.name})` : ''}`
                    : (t.receiverCountry?.name || '—');
                const totalQty = (t.items || []).reduce(
                  (s, i) => s + (i.quantity || 0),
                  0,
                );
                return (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 p-2.5 rounded-[var(--radius-sm)] hover:bg-surface-card-hover transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-content-primary truncate">
                        {from} → {to}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        {(t.items || []).map((item) => (
                          <BraceletBadge key={item.itemType} type={item.itemType} count={item.quantity} size="sm" />
                        ))}
                      </div>
                    </div>
                    <Badge status={t.status} />
                    <span className="text-[10px] text-content-muted flex-shrink-0">
                      {new Date(t.createdAt).toLocaleDateString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
