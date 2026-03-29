import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { useFilterStore, useBadgeStore } from '../store/useAppStore';
import { useNotificationStore } from '../store/useNotificationStore';
import { inventoryApi } from '../api/inventory';
import { transfersApi } from '../api/transfers';
import { usersApi } from '../api/users';
import { notificationsApi } from '../api/notifications';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import BraceletBadge from '../components/ui/BraceletBadge';
import BraceletCard from '../components/ui/BraceletCard';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { getSenderName, getReceiverName, isAdminTransfer, getTotalQuantity } from '../utils/transferHelpers';
import {
  Send, PackageCheck, Globe,
  ArrowRight, Clock,
  CalendarDays, Boxes, AlertTriangle,
  TrendingDown, ShieldAlert,
  BarChart3, MinusCircle, Users,
  Bell, PlusCircle, SlidersHorizontal
} from 'lucide-react';

/* ── helpers ─────────────────────────────── */
const timeAgo = (date) => {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин назад`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ч назад`;
  const days = Math.floor(hrs / 24);
  return `${days} д назад`;
};

const STATUS_ICON = {
  SENT: { icon: Clock, cls: 'text-yellow-400' },
  ACCEPTED: { icon: PackageCheck, cls: 'text-green-400' },
  DISCREPANCY_FOUND: { icon: AlertTriangle, cls: 'text-orange-400' },
  REJECTED: { icon: MinusCircle, cls: 'text-red-400' },
  CANCELLED: { icon: MinusCircle, cls: 'text-gray-400' },
};

const LOSS_COLOR = {
  BLACK: { bg: 'bg-gray-800', ring: 'ring-gray-600', text: 'text-gray-300', label: 'Чёрные' },
  WHITE: { bg: 'bg-gray-200 dark:bg-gray-300', ring: 'ring-gray-300', text: 'text-gray-700 dark:text-gray-800', label: 'Белые' },
  RED:   { bg: 'bg-red-600', ring: 'ring-red-500', text: 'text-red-100', label: 'Красные' },
  BLUE:  { bg: 'bg-blue-600', ring: 'ring-blue-500', text: 'text-blue-100', label: 'Синие' },
};

export default function Dashboard() {
  const { user } = useAuthStore();
  const { countryId, cityId, eventId } = useFilterStore();
  const { pendingCount, problematicCount: badgeProblematic, incomingCount } = useBadgeStore();
  const navigate = useNavigate();

  const [balance, setBalance] = useState(null);
  const [transfers, setTransfers] = useState([]);
  const [problematicCount, setProblematicCount] = useState(0);
  const [stats, setStats] = useState({ countries: 0, cities: 0 });
  const [lossSummary, setLossSummary] = useState(null);
  const [totalUsers, setTotalUsers] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [mapData, setMapData] = useState([]);
  const [loading, setLoading] = useState(true);

  const isAdminOrOffice = user.role === 'ADMIN' || user.role === 'OFFICE';

  useEffect(() => { loadData(); }, [countryId, cityId, eventId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const filterParams = {};
      if (countryId) filterParams.countryId = countryId;
      if (cityId) filterParams.cityId = cityId;
      if (eventId) filterParams.eventId = eventId;

      const promises = [
        transfersApi.getAll({ limit: 200, ...filterParams }),
        usersApi.getCountries(),
        transfersApi.getProblematic({ page: 1, limit: 5, ...filterParams }),
        usersApi.getAll({ limit: 1 }),
        notificationsApi.getAll({ limit: 7 }),
      ];

      if (isAdminOrOffice) {
        promises.push(inventoryApi.getAll(filterParams));
        promises.push(inventoryApi.getCompanyLossesSummary(filterParams));
        if (user.role === 'ADMIN') promises.push(inventoryApi.getMapData());
      } else {
        const entityType = user.role === 'COUNTRY' ? 'COUNTRY' : 'CITY';
        const entityId = user.role === 'COUNTRY' ? user.countryId : user.cityId;
        promises.push(inventoryApi.getBalance(entityType, entityId));
        promises.push(inventoryApi.getCompanyLossesSummary()); // scoped on backend
      }

      const results = await Promise.all(promises);

      // Transfers
      const allData = results[0].data;
      const allPayload = allData?.data || allData;
      setTransfers(Array.isArray(allPayload) ? allPayload : (allPayload?.items || []));

      // Countries
      const countriesPayload = results[1].data?.data || results[1].data;
      const countriesList = Array.isArray(countriesPayload) ? countriesPayload : [];
      const totalCities = countriesList.reduce((sum, c) => sum + (c.cities?.length || 0), 0);
      setStats({ countries: countriesList.length, cities: totalCities });

      // Problematic
      const probData = results[2].data;
      const probList = probData?.data || [];
      setProblematicCount(probData?.meta?.total || (Array.isArray(probList) ? probList.length : 0));

      // Users count
      const usersPayload = results[3].data;
      const usersMeta = usersPayload?.meta;
      if (usersMeta?.total) {
        setTotalUsers(usersMeta.total);
      } else {
        const usersList = usersPayload?.data || usersPayload;
        setTotalUsers(Array.isArray(usersList) ? usersList.length : 0);
      }

      // Notifications
      const notifPayload = results[4].data?.data || results[4].data;
      setNotifications(Array.isArray(notifPayload) ? notifPayload.slice(0, 7) : []);

      // Balance (index 5)
      if (results[5]) {
        const d = results[5].data;
        const dPayload = d?.data || d;
        const VALID_TYPES = ['BLACK', 'WHITE', 'RED', 'BLUE'];

        if (isAdminOrOffice && Array.isArray(dPayload)) {
          const totals = { BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 };
          dPayload.forEach((inv) => {
            if (inv.entityType === 'ADMIN' || inv.entityType === 'OFFICE') return;
            if (totals[inv.itemType] !== undefined) totals[inv.itemType] += inv.quantity || 0;
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

      // Company losses summary (index 6, all roles — backend scopes by role)
      if (results[6]) {
        const lossPayload = results[6].data?.data || results[6].data;
        setLossSummary(lossPayload);
      }

      // Map data (index 7, ADMIN only)
      if (user.role === 'ADMIN' && results[7]) {
        const mapPayload = results[7].data?.data || results[7].data;
        setMapData(Array.isArray(mapPayload) ? mapPayload : []);
      }
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <DashboardSkeleton />;

  /* ── derived data ────────────────── */
  const recentTransfers = [...transfers]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 7);

  const systemTotal = balance ? balance.reduce((s, b) => s + (b.quantity || 0), 0) : 0;

  // Top countries from mapData
  const topCountries = [...mapData]
    .sort((a, b) => {
      const aTotal = (a.black || 0) + (a.white || 0) + (a.red || 0) + (a.blue || 0);
      const bTotal = (b.black || 0) + (b.white || 0) + (b.red || 0) + (b.blue || 0);
      return bTotal - aTotal;
    })
    .slice(0, 8);

  const quickActions = [
    { label: 'Новая отправка', icon: Send, path: '/transfers', color: 'bg-blue-500', roles: ['ADMIN', 'OFFICE', 'COUNTRY'], tooltip: 'Отправить браслеты в страну, город или офис' },
    { label: 'Вернуть опаски', icon: Send, path: '/transfers', color: 'bg-blue-500', roles: ['CITY'], tooltip: 'Вернуть браслеты в страну' },
    { label: 'Добавить расход', icon: CalendarDays, path: '/expenses', color: 'bg-pink-500', roles: ['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'], tooltip: 'Зарегистрировать расход браслетов на мероприятии' },
    { label: 'Получение', icon: PackageCheck, path: '/acceptance', color: 'bg-green-500', roles: ['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'], badge: incomingCount, tooltip: 'Входящие трансферы ожидающие вашего подтверждения' },
    { label: 'Проблемные', icon: AlertTriangle, path: '/problematic', color: 'bg-orange-500', roles: ['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'], badge: badgeProblematic, tooltip: 'Трансферы с расхождением, требующие решения' },
    { label: 'Зависшие', icon: Clock, path: '/pending', color: 'bg-amber-500', roles: ['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'], badge: pendingCount, tooltip: 'Трансферы ожидающие ответа получателя' },
    { label: 'Создать браслеты', icon: PlusCircle, path: '/warehouse', color: 'bg-emerald-600', roles: ['ADMIN', 'OFFICE'], tooltip: 'Добавить новые браслеты в систему' },
    { label: 'Корректировка баланса', icon: SlidersHorizontal, path: '/balance', color: 'bg-indigo-500', roles: ['ADMIN'], tooltip: 'Ручная корректировка остатков браслетов' },
    { label: 'Статистика', icon: BarChart3, path: '/statistics', color: 'bg-purple-500', roles: ['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'], tooltip: 'Аналитика и отчётность' },
    { label: 'Баланс', icon: Boxes, path: '/balance', color: 'bg-amber-600', roles: ['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'], tooltip: 'Остатки браслетов по странам и городам' },
  ].filter((a) => a.roles.includes(user.role));

  /* ── metric cards config ────────────── */
  const metricCards = [
    {
      label: 'Зависшие', value: pendingCount || 0, icon: Clock,
      iconBg: 'bg-amber-500/10', iconColor: 'text-amber-400',
      borderHover: 'hover:border-amber-500/50', path: '/pending',
      tooltip: 'Трансферы отправленные но ещё не принятые получателем',
    },
    {
      label: 'Проблемные', value: badgeProblematic || 0, icon: AlertTriangle,
      iconBg: 'bg-orange-500/10', iconColor: 'text-orange-400',
      borderHover: 'hover:border-orange-500/50',
      path: '/problematic',
      tooltip: 'Трансферы с расхождением в количестве, ожидают решения администратора',
    },
    {
      label: 'Минус компании',
      value: (lossSummary?.total || 0) > 0 ? `-${lossSummary.total}` : '0',
      icon: MinusCircle,
      iconBg: 'bg-red-500/10', iconColor: 'text-red-400',
      valueColor: (lossSummary?.total || 0) > 0 ? 'text-red-400' : undefined,
      borderHover: 'hover:border-red-500/50',
      path: '/company-losses',
      tooltip: 'Общее количество потерянных браслетов по всем инцидентам',
    },
    {
      label: 'Всего пользователей', value: totalUsers, icon: Users,
      iconBg: 'bg-blue-500/10', iconColor: 'text-blue-400',
      borderHover: 'hover:border-blue-500/50',
      path: user.role === 'ADMIN' ? '/users' : null,
      tooltip: 'Общее количество зарегистрированных пользователей в системе',
    },
    {
      label: 'Активных стран', value: stats.countries, icon: Globe,
      iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-400',
      borderHover: 'hover:border-emerald-500/50',
      path: '/balance',
      tooltip: 'Количество стран с активными менеджерами в системе',
    },
  ].filter((c) => !c.roles || c.roles.includes(user.role));

  return (
    <div className="space-y-5">

      {/* ── ROW 1: Metric Cards ───────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {metricCards.map((m) => {
          const Icon = m.icon;
          const clickable = !!m.path;
          return (
            <div
              key={m.label}
              onClick={() => clickable && navigate(m.path)}
              title={m.tooltip}
              className={`bg-surface-card rounded-[var(--radius-md)] border border-edge p-4 transition-colors
                ${clickable ? `cursor-pointer hover:bg-surface-card-hover ${m.borderHover}` : ''}`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-[var(--radius-sm)] ${m.iconBg} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={18} className={m.iconColor} />
                </div>
                <div className="min-w-0">
                  <div className={`text-2xl font-bold tabular-nums ${m.valueColor || 'text-content-primary'}`}>{m.value}</div>
                  <div className="text-xs text-content-muted truncate">{m.label}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── ROW 2: Balance + Company Losses ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* System / personal balance */}
        {balance && balance.length > 0 && (
          <Card
            title={isAdminOrOffice ? `Баланс системы — ${systemTotal} шт` : 'Текущий остаток'}
            action={
              <button onClick={() => navigate('/balance')} className="text-xs text-brand-500 hover:text-brand-400 flex items-center gap-1">
                Подробнее <ArrowRight size={12} />
              </button>
            }
          >
            <div className="grid grid-cols-2 gap-3">
              {['BLACK', 'WHITE', 'RED', 'BLUE'].map((type) => {
                const qty = balance.find((b) => b.itemType === type)?.quantity || 0;
                const colorLabel = { BLACK: 'чёрных', WHITE: 'белых', RED: 'красных', BLUE: 'синих' }[type];
                return (
                  <div key={type} title={`Общее количество ${colorLabel} браслетов ${isAdminOrOffice ? 'во всей системе' : 'на вашем балансе'}`}>
                    <BraceletCard type={type} quantity={qty} total={systemTotal} />
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Company losses by color */}
        {lossSummary && (
          <Card
            title="Минус компании по цветам"
            action={
              <button onClick={() => navigate('/company-losses')} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1">
                Подробнее <ArrowRight size={12} />
              </button>
            }
          >
            <div className="grid grid-cols-2 gap-3">
              {['BLACK', 'WHITE', 'RED', 'BLUE'].map((type) => {
                const cfg = LOSS_COLOR[type];
                const qty = lossSummary?.[type.toLowerCase()] || 0;
                return (
                  <div key={type} className={`${cfg.bg} rounded-[var(--radius-md)] p-3 ring-1 ${cfg.ring} ring-inset`}>
                    <div className={`text-xl font-bold ${cfg.text} tabular-nums`}>-{qty}</div>
                    <div className={`text-xs ${cfg.text} opacity-70`}>{cfg.label}</div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-2 p-2 bg-red-500/10 rounded-lg border border-red-500/30">
              <TrendingDown size={16} className="text-red-400" />
              <span className="text-sm font-bold text-red-400">Итого: -{lossSummary?.total || 0}</span>
            </div>
          </Card>
        )}
      </div>

      {/* ── ROW 3: Recent Transfers + Notifications ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent transfers feed */}
        <Card
          title="Последние отправки"
          action={
            <button onClick={() => navigate('/transfers')} className="text-xs text-brand-500 hover:text-brand-400 flex items-center gap-1">
              Все <ArrowRight size={12} />
            </button>
          }
        >
          {recentTransfers.length === 0 ? (
            <p className="text-sm text-content-muted text-center py-6">Нет отправок</p>
          ) : (
            <div className="space-y-1.5">
              {recentTransfers.map((t) => {
                const isAdmin = isAdminTransfer(t);
                const st = STATUS_ICON[t.status] || STATUS_ICON.SENT;
                const StIcon = st.icon;
                return (
                  <div
                    key={t.id}
                    className={`flex items-center gap-2.5 p-2.5 rounded-[var(--radius-sm)] hover:bg-surface-card-hover transition-colors
                      ${isAdmin ? 'border-l-[3px] border-l-violet-500 bg-violet-500/5' : ''}`}
                  >
                    <StIcon size={16} className={`${st.cls} flex-shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm flex items-center gap-1 flex-wrap">
                        <span className="font-medium text-blue-400 truncate max-w-[80px]">{getSenderName(t)}</span>
                        <span className="text-content-muted">→</span>
                        <span className="font-medium text-emerald-400 truncate max-w-[80px]">{getReceiverName(t)}</span>
                        {isAdmin && <span className="text-[10px] px-1 py-0.5 bg-violet-500/20 text-violet-400 rounded">👑</span>}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        {(t.items || []).map((item) => (
                          <BraceletBadge key={item.itemType} type={item.itemType} count={item.quantity} size="sm" />
                        ))}
                      </div>
                    </div>
                    <span className="text-[10px] text-content-muted flex-shrink-0 whitespace-nowrap">{timeAgo(t.createdAt)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Notifications feed */}
        <Card
          title="Уведомления"
          action={
            <button onClick={() => navigate('/notifications')} className="text-xs text-brand-500 hover:text-brand-400 flex items-center gap-1">
              Все <ArrowRight size={12} />
            </button>
          }
        >
          {notifications.length === 0 ? (
            <p className="text-sm text-content-muted text-center py-6">Нет уведомлений</p>
          ) : (
            <div className="space-y-1.5">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`flex items-start gap-2.5 p-2.5 rounded-[var(--radius-sm)] transition-colors
                    ${!n.read ? 'bg-brand-500/5 border-l-[3px] border-l-brand-500' : 'hover:bg-surface-card-hover'}`}
                >
                  <Bell size={14} className="text-content-muted flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-content-primary line-clamp-2">{n.message || n.title || 'Уведомление'}</p>
                    <span className="text-[10px] text-content-muted">{timeAgo(n.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── ROW 4: Top Countries (ADMIN) ─────────── */}
      {user.role === 'ADMIN' && topCountries.length > 0 && (
        <Card
          title="Топ стран по браслетам"
          action={
            <button onClick={() => navigate('/map')} className="text-xs text-brand-500 hover:text-brand-400 flex items-center gap-1">
              Карта <ArrowRight size={12} />
            </button>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-content-muted text-xs border-b border-edge">
                  <th className="text-left py-2 pr-2 font-medium">Страна</th>
                  <th className="text-right py-2 px-2 font-medium">⬛</th>
                  <th className="text-right py-2 px-2 font-medium">⬜</th>
                  <th className="text-right py-2 px-2 font-medium">🟥</th>
                  <th className="text-right py-2 px-2 font-medium">🟦</th>
                  <th className="text-right py-2 pl-2 font-medium">Всего</th>
                </tr>
              </thead>
              <tbody>
                {topCountries.map((c) => {
                  const total = (c.black || 0) + (c.white || 0) + (c.red || 0) + (c.blue || 0);
                  const maxTotal = topCountries.length > 0
                    ? (topCountries[0].black || 0) + (topCountries[0].white || 0) + (topCountries[0].red || 0) + (topCountries[0].blue || 0)
                    : 1;
                  const pct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;
                  return (
                    <tr key={c.countryId || c.name} className="border-b border-edge/50 hover:bg-surface-card-hover transition-colors">
                      <td className="py-2 pr-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-content-primary">{c.countryName || c.name}</span>
                          <div className="hidden sm:block flex-1 max-w-[80px] h-1.5 bg-surface-secondary rounded-full overflow-hidden">
                            <div className="h-full bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="text-right py-2 px-2 tabular-nums text-content-secondary">{c.black || 0}</td>
                      <td className="text-right py-2 px-2 tabular-nums text-content-secondary">{c.white || 0}</td>
                      <td className="text-right py-2 px-2 tabular-nums text-content-secondary">{c.red || 0}</td>
                      <td className="text-right py-2 px-2 tabular-nums text-content-secondary">{c.blue || 0}</td>
                      <td className="text-right py-2 pl-2 tabular-nums font-bold text-content-primary">{total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Quick Actions ────────────────────────────── */}
      <div>
        <h3 className="text-2xs font-semibold text-content-muted uppercase tracking-widest mb-3">
          Быстрые действия
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={() => navigate(action.path)}
              title={action.tooltip}
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
                  {action.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
