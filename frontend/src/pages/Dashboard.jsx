import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { useFilterStore, useBadgeStore } from '../store/useAppStore';
import { inventoryApi } from '../api/inventory';
import { transfersApi } from '../api/transfers';
import { usersApi } from '../api/users';
import Card from '../components/ui/Card';
import BraceletCard from '../components/ui/BraceletCard';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import {
  Send, PackageCheck,
  ArrowRight, Clock,
  CalendarDays, Boxes, AlertTriangle,
  TrendingDown, ShieldAlert,
  BarChart3, MinusCircle, Users,
  PlusCircle, SlidersHorizontal, Gauge
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
  const [expenses, setExpenses] = useState([]);
  const [problematicCount, setProblematicCount] = useState(0);
  const [stats, setStats] = useState({ countries: 0, cities: 0 });
  const [lossSummary, setLossSummary] = useState(null);
  const [systemMinus, setSystemMinus] = useState(null);
  const [totalUsers, setTotalUsers] = useState(0);
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
        inventoryApi.getExpenses({ limit: 100 }),
      ];

      if (isAdminOrOffice) {
        promises.push(inventoryApi.getAll(filterParams));
        promises.push(inventoryApi.getCompanyLossesSummary(filterParams));
        if (user.role === 'ADMIN') promises.push(inventoryApi.getMapData());
        else promises.push(Promise.resolve(null));
        promises.push(inventoryApi.getSystemLossesSummary());
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

      // Expenses (index 4)
      const expPayload = results[4].data;
      const expList = Array.isArray(expPayload) ? expPayload : (expPayload?.data || []);
      setExpenses(Array.isArray(expList) ? expList : []);

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

      // System minus (index 8, ADMIN/OFFICE only)
      if (isAdminOrOffice && results[8]) {
        const minusPayload = results[8].data?.data || results[8].data;
        setSystemMinus(minusPayload);
      }
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <DashboardSkeleton />;

  /* ── derived data ────────────────── */
  const recentExpenses = [...expenses]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 7);

  const topExpenses = [...expenses]
    .sort((a, b) => {
      const at = (a.black || 0) + (a.white || 0) + (a.red || 0) + (a.blue || 0);
      const bt = (b.black || 0) + (b.white || 0) + (b.red || 0) + (b.blue || 0);
      return bt - at;
    })
    .slice(0, 8);

  const systemTotal = balance ? balance.reduce((s, b) => s + (b.quantity || 0), 0) : 0;

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
      label: isAdminOrOffice ? 'Минус компании' : 'Мои потери',
      value: (lossSummary?.total || 0) > 0 ? `-${lossSummary.total}` : '0',
      icon: MinusCircle,
      iconBg: 'bg-red-500/10', iconColor: 'text-red-400',
      valueColor: (lossSummary?.total || 0) > 0 ? 'text-red-400' : undefined,
      borderHover: 'hover:border-red-500/50',
      path: '/company-losses',
      tooltip: 'Общее количество потерянных браслетов по всем инцидентам',
    },
    {
      label: 'Минус системы',
      value: (systemMinus?.total || 0) > 0 ? `-${systemMinus.total}` : '0',
      icon: Gauge,
      iconBg: 'bg-purple-500/10', iconColor: 'text-purple-400',
      valueColor: (systemMinus?.total || 0) > 0 ? 'text-purple-400' : undefined,
      borderHover: 'hover:border-purple-500/50',
      roles: ['ADMIN', 'OFFICE'],
      tooltip: 'Общая разница между созданными и распределёнными браслетами',
    },
    {
      label: 'Всего пользователей', value: totalUsers, icon: Users,
      iconBg: 'bg-blue-500/10', iconColor: 'text-blue-400',
      borderHover: 'hover:border-blue-500/50',
      path: user.role === 'ADMIN' ? '/users' : null,
      tooltip: 'Общее количество зарегистрированных пользователей в системе',
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
            title={isAdminOrOffice ? `Баланс системы — ${systemTotal} шт` : `Мой баланс — ${systemTotal} шт`}
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
            title={isAdminOrOffice ? 'Минус компании по цветам' : 'Мои потери по цветам'}
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

      {/* ── ROW 2b: System Minus (ADMIN/OFFICE) ──── */}
      {systemMinus && (
        <Card
          title={`Минус по городам и странам — ${systemMinus.total} шт`}
          action={
            <span className="text-xs text-content-muted">
              Компания: {systemMinus.companyCount || 0} · Аккаунты: {systemMinus.shortageCount || 0}
            </span>
          }
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {['BLACK', 'WHITE', 'RED', 'BLUE'].map((type) => {
              const val = systemMinus?.[type.toLowerCase()] || 0;
              const label = { BLACK: 'Чёрные', WHITE: 'Белые', RED: 'Красные', BLUE: 'Синие' }[type];
              const styles = {
                BLACK: { bg: 'bg-gray-900 dark:bg-gray-800', text: 'text-gray-300', ring: 'ring-gray-700' },
                WHITE: { bg: 'bg-gray-100 dark:bg-gray-400', text: 'text-gray-700 dark:text-gray-900', ring: 'ring-gray-300 dark:ring-gray-500' },
                RED: { bg: 'bg-red-900/60 dark:bg-red-900/50', text: 'text-red-200', ring: 'ring-red-700/50' },
                BLUE: { bg: 'bg-blue-900/60 dark:bg-blue-900/50', text: 'text-blue-200', ring: 'ring-blue-700/50' },
              }[type];
              return (
                <div key={type} className={`${styles.bg} rounded-[var(--radius-md)] p-3 ring-1 ${styles.ring} ring-inset`}>
                  <div className={`text-xl font-bold ${styles.text} tabular-nums`}>{val}</div>
                  <div className={`text-xs ${styles.text} opacity-60`}>{label}</div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-2 p-2 bg-purple-500/10 rounded-lg border border-purple-500/30">
            <Gauge size={16} className="text-purple-400" />
            <span className="text-sm font-bold text-purple-400">
              Итого: {systemMinus.total}
            </span>
            <span className="text-xs text-content-muted ml-auto">потери компании + расхождения аккаунтов</span>
          </div>
        </Card>
      )}

      {/* ── ROW 3: Recent Expenses + Top Expenses ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent expenses feed */}
        <Card
          title="Последние расходы"
          action={
            <button onClick={() => navigate('/expenses')} className="text-xs text-brand-500 hover:text-brand-400 flex items-center gap-1">
              Все <ArrowRight size={12} />
            </button>
          }
        >
          {recentExpenses.length === 0 ? (
            <p className="text-sm text-content-muted text-center py-6">Нет расходов</p>
          ) : (
            <div className="space-y-1.5">
              {recentExpenses.map((ex) => {
                const total = (ex.black || 0) + (ex.white || 0) + (ex.red || 0) + (ex.blue || 0);
                return (
                  <div
                    key={ex.id}
                    className="flex items-center gap-2.5 p-2.5 rounded-[var(--radius-sm)] hover:bg-surface-card-hover transition-colors"
                  >
                    <CalendarDays size={16} className="text-purple-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-content-primary truncate">{ex.eventName}</div>
                      <div className="text-[11px] text-content-muted">{ex.city?.name || 'Город'}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="text-sm font-bold text-red-400">-{total}</span>
                      <div className="text-[10px] text-content-muted whitespace-nowrap">{timeAgo(ex.createdAt)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Top expenses by volume */}
        <Card
          title="Топ расходов"
          action={
            <button onClick={() => navigate('/expenses')} className="text-xs text-brand-500 hover:text-brand-400 flex items-center gap-1">
              Подробнее <ArrowRight size={12} />
            </button>
          }
        >
          {topExpenses.length === 0 ? (
            <p className="text-sm text-content-muted text-center py-6">Нет расходов</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-content-muted text-xs border-b border-edge">
                    <th className="text-left py-2 pr-2 font-medium">Событие</th>
                    <th className="text-right py-2 px-2 font-medium">⬛</th>
                    <th className="text-right py-2 px-2 font-medium">⬜</th>
                    <th className="text-right py-2 px-2 font-medium">🟥</th>
                    <th className="text-right py-2 px-2 font-medium">🟦</th>
                    <th className="text-right py-2 pl-2 font-medium">Всего</th>
                  </tr>
                </thead>
                <tbody>
                  {topExpenses.map((ex) => {
                    const total = (ex.black || 0) + (ex.white || 0) + (ex.red || 0) + (ex.blue || 0);
                    return (
                      <tr key={ex.id} className="border-b border-edge/50 hover:bg-surface-card-hover transition-colors">
                        <td className="py-2 pr-2">
                          <div className="font-medium text-content-primary truncate max-w-[180px]">{ex.eventName}</div>
                          <div className="text-[10px] text-content-muted">{ex.city?.name || ''}</div>
                        </td>
                        <td className="text-right py-2 px-2 tabular-nums text-content-secondary">{ex.black || 0}</td>
                        <td className="text-right py-2 px-2 tabular-nums text-content-secondary">{ex.white || 0}</td>
                        <td className="text-right py-2 px-2 tabular-nums text-content-secondary">{ex.red || 0}</td>
                        <td className="text-right py-2 px-2 tabular-nums text-content-secondary">{ex.blue || 0}</td>
                        <td className="text-right py-2 pl-2 tabular-nums font-bold text-content-primary">{total}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

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
