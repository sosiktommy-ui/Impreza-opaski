import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { useFilterStore, useBadgeStore } from '../store/useAppStore';
import { inventoryApi } from '../api/inventory';
import { transfersApi } from '../api/transfers';
import { usersApi } from '../api/users';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import BraceletBadge from '../components/ui/BraceletBadge';
import BraceletCard from '../components/ui/BraceletCard';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { getSenderName, getReceiverName, isAdminTransfer, getTotalQuantity, getTransferCardClass } from '../utils/transferHelpers';
import {
  Send, PackageCheck, Globe, MapPin,
  ArrowRight, Activity, Clock,
  CalendarDays, Boxes, AlertTriangle,
  TrendingUp, TrendingDown, ShieldAlert,
  BarChart3, RefreshCw, MinusCircle
} from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuthStore();
  const { countryId, cityId, eventId } = useFilterStore();
  const { pendingCount, problematicCount: badgeProblematic, incomingCount } = useBadgeStore();
  const navigate = useNavigate();
  const [balance, setBalance] = useState(null);
  const [pending, setPending] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [problematicCount, setProblematicCount] = useState(0);
  const [problematicTransfers, setProblematicTransfers] = useState([]);
  const [stats, setStats] = useState({ countries: 0, cities: 0 });
  const [lossSummary, setLossSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [countryId, cityId, eventId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const isAdminOrOffice = user.role === 'ADMIN' || user.role === 'OFFICE';
      
      // Build filter params
      const filterParams = {};
      if (countryId) filterParams.countryId = countryId;
      if (cityId) filterParams.cityId = cityId;
      if (eventId) filterParams.eventId = eventId;
      
      const promises = [
        transfersApi.getAll({ limit: 200, ...filterParams }),
        transfersApi.getPending(),
        usersApi.getCountries(),
        transfersApi.getProblematic({ page: 1, limit: 5 }),
      ];

      if (isAdminOrOffice) {
        promises.push(inventoryApi.getAll());
        promises.push(inventoryApi.getCompanyLossesSummary());
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

      // Countries & cities count
      const countriesData = results[2].data;
      const countriesPayload = countriesData?.data || countriesData;
      const countriesList = Array.isArray(countriesPayload) ? countriesPayload : [];
      const totalCities = countriesList.reduce((sum, c) => sum + (c.cities?.length || 0), 0);
      setStats({ countries: countriesList.length, cities: totalCities });

      // Problematic transfers
      const probData = results[3].data;
      const probList = probData?.data || [];
      setProblematicTransfers(Array.isArray(probList) ? probList : []);
      setProblematicCount(probData?.meta?.total || probList.length);

      // Balance
      if (results[4]) {
        const d = results[4].data;
        const dPayload = d?.data || d;
        const VALID_TYPES = ['BLACK', 'WHITE', 'RED', 'BLUE'];

        if (isAdminOrOffice && Array.isArray(dPayload)) {
          const totals = { BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 };
          // Filter out ADMIN and OFFICE inventory - only count COUNTRY and CITY balances
          dPayload.forEach((inv) => {
            if (inv.entityType === 'ADMIN' || inv.entityType === 'OFFICE') {
              return; // Skip admin/office balances
            }
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

      // Company losses summary (for ADMIN/OFFICE)
      if (isAdminOrOffice && results[5]) {
        const lossData = results[5].data;
        const lossPayload = lossData?.data || lossData;
        setLossSummary(lossPayload);
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
    { label: 'Добавить расход', icon: CalendarDays, path: '/expenses', color: 'bg-pink-500', roles: ['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'] },
    { label: 'Получение', icon: PackageCheck, path: '/acceptance', color: 'bg-green-500', roles: ['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'], badge: incomingCount },
    { label: 'Проблемные', icon: AlertTriangle, path: '/problematic', color: 'bg-orange-500', roles: ['ADMIN', 'OFFICE'], badge: badgeProblematic },
    { label: 'Зависшие', icon: Clock, path: '/pending', color: 'bg-amber-500', roles: ['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'], badge: pendingCount },
    { label: 'Статистика', icon: BarChart3, path: '/statistics', color: 'bg-purple-500', roles: ['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'] },
    { label: 'Баланс', icon: Boxes, path: '/balance', color: 'bg-amber-600', roles: ['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'] },
  ].filter((a) => a.roles.includes(user.role));

  return (
    <div className="space-y-4">
      {/* ── Gradient Header ──────────────────────────── */}
      <div className="bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 rounded-[var(--radius-md)] p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Привет, {user.displayName}! <span className="text-xs text-white/40">v8</span>
            </h1>
            <p className="text-white/60 mt-1 text-sm flex items-center gap-1.5">
              {(user.role === 'ADMIN' || user.role === 'OFFICE') ? <Globe size={14} /> : <MapPin size={14} />}
              {entityLabel}
            </p>
          </div>
        </div>
      </div>

      {/* ── 3 Clickable Counters ───────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {/* Зависшие */}
        <div
          onClick={() => navigate('/pending')}
          className="bg-surface-card rounded-[var(--radius-md)] border border-edge p-4 cursor-pointer hover:bg-surface-card-hover hover:border-amber-500/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-amber-500/10 flex items-center justify-center flex-shrink-0">
              <Clock size={18} className="text-amber-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-content-primary">{pendingCount || pending.length}</div>
              <div className="text-xs text-content-muted">Зависшие</div>
            </div>
          </div>
        </div>
        
        {/* Проблемные */}
        <div
          onClick={() => (user.role === 'ADMIN' || user.role === 'OFFICE') && navigate('/problematic')}
          className={`bg-surface-card rounded-[var(--radius-md)] border border-edge p-4 transition-colors ${(user.role === 'ADMIN' || user.role === 'OFFICE') ? 'cursor-pointer hover:bg-surface-card-hover hover:border-orange-500/50' : ''}`}
          title={(user.role === 'CITY' || user.role === 'COUNTRY') ? 'Если есть проблемные отправки — обратитесь к администратору или офису для решения' : undefined}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-orange-500/10 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={18} className="text-orange-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-content-primary">{problematicCount}</div>
              <div className="text-xs text-content-muted">Проблемные</div>
            </div>
          </div>
        </div>
        
        {/* Убытки (Минус компании) - только для ADMIN/OFFICE */}
        {(user.role === 'ADMIN' || user.role === 'OFFICE') && (
          <div
            onClick={() => navigate('/company-losses')}
            className="bg-surface-card rounded-[var(--radius-md)] border border-edge p-4 cursor-pointer hover:bg-surface-card-hover hover:border-red-500/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-red-500/10 flex items-center justify-center flex-shrink-0">
                <MinusCircle size={18} className="text-red-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-content-primary">{lossSummary?.total || 0}</div>
                <div className="text-xs text-content-muted">Минус компании</div>
              </div>
            </div>
          </div>
        )}
        
        {/* Для CITY/COUNTRY показываем счетчик городов вместо убытков */}
        {(user.role === 'CITY' || user.role === 'COUNTRY') && (
          <div className="bg-surface-card rounded-[var(--radius-md)] border border-edge p-4 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                <MapPin size={18} className="text-violet-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-content-primary">{stats.cities}</div>
                <div className="text-xs text-content-muted">Городов</div>
              </div>
            </div>
          </div>
        )}
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
              onClick={() => navigate('/balance')}
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

      {/* ── Company Losses Summary (ADMIN/OFFICE) ──────── */}
      {(user.role === 'ADMIN' || user.role === 'OFFICE') && lossSummary && lossSummary.totalQuantity > 0 && (
        <div className="bg-red-500/5 rounded-[var(--radius-md)] border border-red-500/20 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-red-500/10">
            <h3 className="font-semibold text-red-400 flex items-center gap-2">
              <MinusCircle size={16} />
              Минус компании
            </h3>
            <button
              onClick={() => navigate('/company-losses')}
              className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 font-medium"
            >
              Подробнее <ArrowRight size={12} />
            </button>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {['BLACK', 'WHITE', 'RED', 'BLUE'].map((type) => {
                const colorLabels = { BLACK: 'Чёрные', WHITE: 'Белые', RED: 'Красные', BLUE: 'Синие' };
                const colorClasses = { BLACK: 'bg-gray-700', WHITE: 'bg-gray-100', RED: 'bg-red-500', BLUE: 'bg-blue-500' };
                const qty = lossSummary?.[type.toLowerCase()] || 0;
                return (
                  <div key={type} className="flex items-center gap-2 p-2 bg-surface-card rounded-lg border border-edge">
                    <span className={`w-4 h-4 rounded-full ${colorClasses[type]} flex-shrink-0`} />
                    <div>
                      <div className="text-sm font-bold text-red-400">-{qty}</div>
                      <div className="text-[10px] text-content-muted">{colorLabels[type]}</div>
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center gap-2 p-2 bg-red-500/10 rounded-lg border border-red-500/30">
                <TrendingDown size={16} className="text-red-400" />
                <div>
                  <div className="text-sm font-bold text-red-400">-{lossSummary?.total || 0}</div>
                  <div className="text-[10px] text-content-muted">Всего</div>
                </div>
              </div>
            </div>
          </div>
        </div>
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
            {pending.slice(0, 3).map((t) => {
              const isAdmin = isAdminTransfer(t);
              return (
              <div
                key={t.id}
                className={`flex items-center justify-between p-3 bg-surface-card rounded-[var(--radius-sm)] border border-edge ${isAdmin ? 'border-l-[3px] border-l-violet-500 bg-violet-500/5' : ''}`}
              >
                <div>
                  <div className="text-sm font-medium text-content-primary flex items-center gap-1.5">
                    От: {getSenderName(t)}
                    {isAdmin && <span className="text-xs px-1.5 py-0.5 bg-violet-500/20 text-violet-400 rounded font-medium">👑</span>}
                  </div>
                  <div className="text-xs text-content-muted mt-0.5">
                    Пересчитайте и примите
                  </div>
                </div>
                <Badge status={t.status} />
              </div>
            );
            })}
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={() => navigate(action.path)}
              className="group relative bg-surface-card rounded-[var(--radius-md)] border border-edge p-4 text-left hover:border-edge/80 transition-all"
            >
              <div
                className={`w-10 h-10 ${action.color} rounded-[var(--radius-sm)] flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}
              >
                <action.icon size={20} className="text-white" />
              </div>
              <div className="text-sm font-medium text-content-primary">
                {action.label}
              </div>
              {action.badge > 0 && (
                <span className="absolute top-2 right-2 min-w-[20px] h-5 flex items-center justify-center rounded-full bg-red-500 text-white text-2xs font-bold px-1.5 animate-pulse">
                  {action.badge > 99 ? '99+' : action.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Problematic Alerts (ADMIN/OFFICE) ──────────── */}
      {(user.role === 'ADMIN' || user.role === 'OFFICE') && problematicTransfers.length > 0 && (
        <div className="bg-red-500/5 rounded-[var(--radius-md)] border border-red-500/20 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-red-500/10">
            <h3 className="font-semibold text-red-400 flex items-center gap-2">
              <ShieldAlert size={16} />
              Требуют решения ({problematicCount})
            </h3>
            <button
              onClick={() => navigate('/problematic')}
              className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 font-medium"
            >
              Все <ArrowRight size={12} />
            </button>
          </div>
          <div className="p-4 space-y-2">
            {problematicTransfers.slice(0, 3).map((t) => {
              const totalDiff = (t.acceptanceRecords || []).reduce((s, r) => s + (r.discrepancy || 0), 0);
              const isAdmin = isAdminTransfer(t);
              return (
                <div
                  key={t.id}
                  className={`flex items-center justify-between p-3 bg-surface-card rounded-[var(--radius-sm)] border border-edge ${isAdmin ? 'border-l-[3px] border-l-violet-500 bg-violet-500/5' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-blue-400 truncate max-w-[100px]">{getSenderName(t)}</span>
                      <span className="text-content-muted">→</span>
                      <span className="font-medium text-emerald-400 truncate max-w-[100px]">{getReceiverName(t)}</span>
                      {isAdmin && <span className="text-xs px-1.5 py-0.5 bg-violet-500/20 text-violet-400 rounded font-medium">👑</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {t.items?.map((item) => (
                        <BraceletBadge key={item.itemType} type={item.itemType} count={item.quantity} size="sm" />
                      ))}
                      {totalDiff !== 0 && (
                        <span className="text-xs text-red-400 font-medium flex items-center gap-0.5">
                          <TrendingDown size={12} />
                          {Math.abs(totalDiff)} шт
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge variant="warning">Расхождение</Badge>
                </div>
              );
            })}
            {problematicCount > 3 && (
              <button
                onClick={() => navigate('/problematic')}
                className="w-full text-center text-xs text-red-400 hover:text-red-300 py-2"
              >
                Ещё {problematicCount - 3} расхождений →
              </button>
            )}
          </div>
        </div>
      )}

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
                const totalQty = getTotalQuantity(t);
                const isAdmin = isAdminTransfer(t);
                return (
                  <div
                    key={t.id}
                    className={`flex items-center gap-3 p-2.5 rounded-[var(--radius-sm)] hover:bg-surface-card-hover transition-colors ${isAdmin ? 'border-l-[3px] border-l-violet-500 bg-violet-500/5' : ''}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-blue-400 truncate max-w-[80px]" title={getSenderName(t)}>{getSenderName(t)}</span>
                        <span className="text-content-muted">→</span>
                        <span className="font-medium text-emerald-400 truncate max-w-[80px]" title={getReceiverName(t)}>{getReceiverName(t)}</span>
                        {isAdmin && <span className="text-xs px-1.5 py-0.5 bg-violet-500/20 text-violet-400 rounded font-medium">👑</span>}
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
