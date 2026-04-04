import { useState, useEffect, useMemo } from 'react';
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
  PlusCircle, SlidersHorizontal, Gauge,
  ChevronDown, ChevronRight
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
  const [rawInventory, setRawInventory] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [problematicCount, setProblematicCount] = useState(0);
  const [stats, setStats] = useState({ countries: 0, cities: 0 });
  const [lossSummary, setLossSummary] = useState(null);
  const [systemMinus, setSystemMinus] = useState(null);
  const [systemLossDetails, setSystemLossDetails] = useState([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [mapData, setMapData] = useState([]);
  const [cityBalances, setCityBalances] = useState([]);
  const [citiesLossSummary, setCitiesLossSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  // Expandable sections
  const [balanceExpanded, setBalanceExpanded] = useState(false);
  const [expandedBalCountries, setExpandedBalCountries] = useState({});
  const [lossExpanded, setLossExpanded] = useState(false);
  const [expandedLossCountries, setExpandedLossCountries] = useState({});

  const isAdminOrOffice = user.role === 'ADMIN' || user.role === 'OFFICE';

  useEffect(() => { loadData(); }, [countryId, cityId, eventId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const filterParams = {};
      if (countryId) filterParams.countryId = countryId;
      if (cityId) filterParams.cityId = cityId;
      if (eventId) filterParams.eventId = eventId;

      if (isAdminOrOffice) {
        const [transfersRes, countriesRes, probRes, usersRes, expRes, balanceRes, lossRes, mapRes, sysLossRes, sysLossDetailRes] = await Promise.all([
          transfersApi.getAll({ limit: 200, ...filterParams }),
          usersApi.getCountries(),
          transfersApi.getProblematic({ page: 1, limit: 5, ...filterParams }),
          usersApi.getAll({ limit: 1 }),
          inventoryApi.getExpenses({ limit: 100 }),
          inventoryApi.getAll(filterParams),
          inventoryApi.getCompanyLossesSummary(filterParams),
          inventoryApi.getMapData().catch(() => null),
          inventoryApi.getSystemLossesSummary(),
          inventoryApi.getSystemLosses({ limit: 500 }).catch(() => ({ data: { data: [] } })),
        ]);

        const allPayload = transfersRes.data?.data || transfersRes.data;
        setTransfers(Array.isArray(allPayload) ? allPayload : (allPayload?.items || []));

        const countriesPayload = countriesRes.data?.data || countriesRes.data;
        const countriesList = Array.isArray(countriesPayload) ? countriesPayload : [];
        const totalCities = countriesList.reduce((sum, c) => sum + (c.cities?.length || 0), 0);
        setStats({ countries: countriesList.length, cities: totalCities });

        const probData = probRes.data;
        setProblematicCount(probData?.meta?.total || (Array.isArray(probData?.data || []) ? (probData?.data || []).length : 0));

        const usersPayload = usersRes.data;
        const usersMeta = usersPayload?.meta;
        if (usersMeta?.total) setTotalUsers(usersMeta.total);
        else {
          const usersList = usersPayload?.data || usersPayload;
          setTotalUsers(Array.isArray(usersList) ? usersList.length : 0);
        }

        const expPayload = expRes.data;
        const expList = Array.isArray(expPayload) ? expPayload : (expPayload?.data || []);
        setExpenses(Array.isArray(expList) ? expList : []);

        const dPayload = balanceRes.data?.data || balanceRes.data;
        if (Array.isArray(dPayload)) {
          setRawInventory(dPayload);
          const totals = { BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 };
          dPayload.forEach((inv) => {
            if (totals[inv.itemType] !== undefined) totals[inv.itemType] += inv.quantity || 0;
          });
          setBalance(Object.entries(totals).map(([itemType, quantity]) => ({ itemType, quantity })));
        }

        if (lossRes) setLossSummary(lossRes.data?.data || lossRes.data);
        if (mapRes) {
          const mapPayload = mapRes.data?.data || mapRes.data;
          setMapData(Array.isArray(mapPayload) ? mapPayload : []);
        }
        if (sysLossRes) setSystemMinus(sysLossRes.data?.data || sysLossRes.data);
        if (sysLossDetailRes) {
          const ld = sysLossDetailRes.data?.data || sysLossDetailRes.data;
          setSystemLossDetails(Array.isArray(ld) ? ld : (ld?.data || []));
        }

      } else if (user.role === 'COUNTRY' && user.countryId) {
        const [transfersRes, probRes, expRes, countryDataRes, ownLossRes, citiesLossRes] = await Promise.all([
          transfersApi.getAll({ limit: 200, ...filterParams }),
          transfersApi.getProblematic({ page: 1, limit: 5, ...filterParams }),
          inventoryApi.getExpenses({ limit: 100 }),
          inventoryApi.getByCountry(user.countryId),
          inventoryApi.getCompanyLossesSummary({ scope: 'own' }),
          inventoryApi.getCompanyLossesSummary({ scope: 'cities' }),
        ]);

        const allPayload = transfersRes.data?.data || transfersRes.data;
        setTransfers(Array.isArray(allPayload) ? allPayload : (allPayload?.items || []));

        const probData = probRes.data;
        setProblematicCount(probData?.meta?.total || (Array.isArray(probData?.data || []) ? (probData?.data || []).length : 0));

        const expPayload = expRes.data;
        const expList = Array.isArray(expPayload) ? expPayload : (expPayload?.data || []);
        setExpenses(Array.isArray(expList) ? expList : []);

        const cData = countryDataRes.data?.data || countryDataRes.data;
        if (cData) {
          const countryBal = cData.country;
          const VALID_TYPES = ['BLACK', 'WHITE', 'RED', 'BLUE'];
          if (countryBal && typeof countryBal === 'object') {
            setBalance(
              Object.entries(countryBal)
                .filter(([key]) => VALID_TYPES.includes(key))
                .map(([itemType, quantity]) => ({ itemType, quantity: Number(quantity) || 0 }))
            );
          }
          if (Array.isArray(cData.cities)) setCityBalances(cData.cities);
        }

        if (ownLossRes) setLossSummary(ownLossRes.data?.data || ownLossRes.data);
        if (citiesLossRes) setCitiesLossSummary(citiesLossRes.data?.data || citiesLossRes.data);

      } else {
        // CITY (and fallback)
        const entityId = user.cityId;
        const [transfersRes, probRes, expRes, balanceRes, lossRes] = await Promise.all([
          transfersApi.getAll({ limit: 200, ...filterParams }),
          transfersApi.getProblematic({ page: 1, limit: 5, ...filterParams }),
          inventoryApi.getExpenses({ limit: 100 }),
          entityId ? inventoryApi.getBalance('CITY', entityId) : Promise.resolve(null),
          inventoryApi.getCompanyLossesSummary(),
        ]);

        const allPayload = transfersRes.data?.data || transfersRes.data;
        setTransfers(Array.isArray(allPayload) ? allPayload : (allPayload?.items || []));

        const probData = probRes.data;
        setProblematicCount(probData?.meta?.total || (Array.isArray(probData?.data || []) ? (probData?.data || []).length : 0));

        const expPayload = expRes.data;
        const expList = Array.isArray(expPayload) ? expPayload : (expPayload?.data || []);
        setExpenses(Array.isArray(expList) ? expList : []);

        if (balanceRes) {
          const dPayload = balanceRes.data?.data || balanceRes.data;
          const VALID_TYPES = ['BLACK', 'WHITE', 'RED', 'BLUE'];
          if (dPayload && typeof dPayload === 'object' && !Array.isArray(dPayload)) {
            setBalance(
              Object.entries(dPayload)
                .filter(([key]) => VALID_TYPES.includes(key))
                .map(([itemType, quantity]) => ({ itemType, quantity: Number(quantity) || 0 }))
            );
          }
        }

        if (lossRes) setLossSummary(lossRes.data?.data || lossRes.data);
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

  /* ── balance accordion hierarchy ─── */
  const balanceHierarchy = useMemo(() => {
    if (!rawInventory.length) return { offices: [], countries: [] };
    const offMap = {}, cMap = {}, ciMap = {};
    rawInventory.forEach(inv => {
      if (inv.entityType === 'ADMIN') return;
      const key = inv.entityType === 'OFFICE' ? inv.officeId
        : inv.entityType === 'COUNTRY' ? inv.countryId
        : inv.entityType === 'CITY' ? inv.cityId : null;
      if (!key) return;
      const t = inv.entityType === 'OFFICE' ? offMap : inv.entityType === 'COUNTRY' ? cMap : ciMap;
      if (!t[key]) t[key] = { id: key, name: inv.office?.name || inv.country?.name || inv.city?.name || key, countryId: inv.city?.countryId || inv.countryId, BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 };
      if (t[key][inv.itemType] !== undefined) t[key][inv.itemType] += inv.quantity || 0;
    });
    const countries = Object.values(cMap).map(c => ({
      ...c, total: c.BLACK + c.WHITE + c.RED + c.BLUE,
      cities: Object.values(ciMap).filter(ci => ci.countryId === c.id)
        .map(ci => ({ ...ci, total: ci.BLACK + ci.WHITE + ci.RED + ci.BLUE }))
        .sort((a, b) => b.total - a.total),
    })).sort((a, b) => b.total - a.total);
    const offices = Object.values(offMap).map(o => ({ ...o, total: o.BLACK + o.WHITE + o.RED + o.BLUE })).sort((a, b) => b.total - a.total);
    return { offices, countries };
  }, [rawInventory]);

  /* ── loss accordion hierarchy ─── */
  const lossHierarchy = useMemo(() => {
    if (!systemLossDetails.length) return [];
    const grouped = {};
    systemLossDetails.forEach(loss => {
      const key = loss.entityName || 'Неизвестно';
      if (!grouped[key]) grouped[key] = { name: key, type: loss.type, entityType: loss.entityType, BLACK: 0, WHITE: 0, RED: 0, BLUE: 0, total: 0 };
      grouped[key].BLACK += loss.black || 0;
      grouped[key].WHITE += loss.white || 0;
      grouped[key].RED += loss.red || 0;
      grouped[key].BLUE += loss.blue || 0;
      grouped[key].total += loss.totalAmount || 0;
    });
    return Object.values(grouped).sort((a, b) => b.total - a.total);
  }, [systemLossDetails]);

  const toggleBalCountry = (id) => setExpandedBalCountries(p => ({ ...p, [id]: !p[id] }));
  const toggleLossEntity = (n) => setExpandedLossCountries(p => ({ ...p, [n]: !p[n] }));

  /* ── inline helper: color badge row ─── */
  const colorRow = (d, bold) => (
    <div className={`flex items-center gap-2 text-xs tabular-nums ${bold ? 'text-content-secondary' : 'text-content-muted'}`}>
      <span>⬛{d.BLACK}</span><span>⬜{d.WHITE}</span>
      <span className="text-red-400">🟥{d.RED}</span><span className="text-blue-400">🟦{d.BLUE}</span>
      <span className={`${bold ? 'font-bold text-content-primary' : 'font-semibold text-content-secondary'} ml-1`}>{d.total}</span>
    </div>
  );

  const balanceTitle = user.role === 'ADMIN' ? 'Общий баланс' :
                       user.role === 'OFFICE' ? 'Баланс офиса' : 'Мой баланс';

  const citiesTotal = cityBalances.reduce((sum, { balance: bal }) => {
    return sum + (Number(bal?.BLACK) || 0) + (Number(bal?.WHITE) || 0) + (Number(bal?.RED) || 0) + (Number(bal?.BLUE) || 0);
  }, 0);

  const renderLossCard = (title, data) => (
    data ? (
      <Card
        title={title}
        className="cursor-pointer hover:border-red-500/40 transition-colors"
        onClick={() => navigate('/company-losses')}
        action={
          <span className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1">
            Подробнее <ArrowRight size={12} />
          </span>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          {['BLACK', 'WHITE', 'RED', 'BLUE'].map((type) => {
            const cfg = LOSS_COLOR[type];
            const qty = data?.[type.toLowerCase()] || 0;
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
          <span className="text-sm font-bold text-red-400">Итого: -{data?.total || 0}</span>
        </div>
      </Card>
    ) : null
  );

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
      tooltip: 'Трансферы с расхождением в количестве, ожидают решения',
    },
  ];

  if (isAdminOrOffice) {
    metricCards.push(
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
        label: 'Минус системы',
        value: (systemMinus?.total || 0) > 0 ? `-${systemMinus.total}` : '0',
        icon: Gauge,
        iconBg: 'bg-purple-500/10', iconColor: 'text-purple-400',
        valueColor: (systemMinus?.total || 0) > 0 ? 'text-purple-400' : undefined,
        borderHover: 'hover:border-purple-500/50',
        tooltip: 'Потери компании + расхождения аккаунтов',
      },
      {
        label: 'Всего пользователей', value: totalUsers, icon: Users,
        iconBg: 'bg-blue-500/10', iconColor: 'text-blue-400',
        borderHover: 'hover:border-blue-500/50',
        path: user.role === 'ADMIN' ? '/users' : null,
        tooltip: 'Общее количество зарегистрированных пользователей в системе',
      },
    );
  } else if (user.role === 'COUNTRY') {
    metricCards.push(
      {
        label: 'Мои потери',
        value: (lossSummary?.total || 0) > 0 ? `-${lossSummary.total}` : '0',
        icon: MinusCircle,
        iconBg: 'bg-red-500/10', iconColor: 'text-red-400',
        valueColor: (lossSummary?.total || 0) > 0 ? 'text-red-400' : undefined,
        borderHover: 'hover:border-red-500/50',
        path: '/company-losses',
        tooltip: 'Потери по вашей стране',
      },
      {
        label: 'Потери городов',
        value: (citiesLossSummary?.total || 0) > 0 ? `-${citiesLossSummary.total}` : '0',
        icon: TrendingDown,
        iconBg: 'bg-orange-500/10', iconColor: 'text-orange-400',
        valueColor: (citiesLossSummary?.total || 0) > 0 ? 'text-orange-400' : undefined,
        borderHover: 'hover:border-orange-500/50',
        path: '/company-losses',
        tooltip: 'Потери подчинённых городов',
      },
    );
  } else {
    metricCards.push({
      label: 'Мои потери',
      value: (lossSummary?.total || 0) > 0 ? `-${lossSummary.total}` : '0',
      icon: MinusCircle,
      iconBg: 'bg-red-500/10', iconColor: 'text-red-400',
      valueColor: (lossSummary?.total || 0) > 0 ? 'text-red-400' : undefined,
      borderHover: 'hover:border-red-500/50',
      path: '/company-losses',
      tooltip: 'Потери по вашему городу',
    });
  }

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

      {/* ── ROW 2: Balance + Second Panel ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Balance card (all roles) */}
        {balance && balance.length > 0 && (
          <Card
            title={`${balanceTitle} — ${systemTotal} шт`}
            action={
              <div className="flex items-center gap-2">
                {isAdminOrOffice && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setBalanceExpanded(!balanceExpanded); }}
                    className="text-xs text-content-muted hover:text-content-primary flex items-center gap-1 transition-colors"
                  >
                    {balanceExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    {balanceExpanded ? 'Свернуть' : 'Развернуть'}
                  </button>
                )}
                <button onClick={() => navigate('/balance')} className="text-xs text-brand-500 hover:text-brand-400 flex items-center gap-1">
                  Подробнее <ArrowRight size={12} />
                </button>
              </div>
            }
          >
            <div className="grid grid-cols-2 gap-3">
              {['BLACK', 'WHITE', 'RED', 'BLUE'].map((type) => {
                const qty = balance.find((b) => b.itemType === type)?.quantity || 0;
                return (
                  <div key={type}>
                    <BraceletCard type={type} quantity={qty} total={systemTotal} />
                  </div>
                );
              })}
            </div>

            {/* Expandable hierarchy */}
            {isAdminOrOffice && balanceExpanded && (
              <div className="mt-4 space-y-1 border-t border-edge pt-3">
                {balanceHierarchy.offices.map(o => (
                  <div key={o.id} className="flex items-center justify-between p-2 rounded-[var(--radius-sm)] bg-surface-card-hover/50">
                    <span className="text-sm font-medium text-content-primary">🏢 {o.name}</span>
                    {colorRow(o, true)}
                  </div>
                ))}
                {balanceHierarchy.countries.map(c => (
                  <div key={c.id}>
                    <div
                      onClick={() => toggleBalCountry(c.id)}
                      className="flex items-center justify-between p-2 rounded-[var(--radius-sm)] hover:bg-surface-card-hover cursor-pointer transition-colors"
                    >
                      <span className="text-sm font-medium text-content-primary flex items-center gap-1">
                        {expandedBalCountries[c.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        🌍 {c.name}
                      </span>
                      {colorRow(c, true)}
                    </div>
                    {expandedBalCountries[c.id] && c.cities.length > 0 && (
                      <div className="ml-6 space-y-0.5">
                        {c.cities.map(ci => (
                          <div key={ci.id} className="flex items-center justify-between p-1.5 pl-3 rounded-[var(--radius-sm)] hover:bg-surface-card-hover/50 transition-colors">
                            <span className="text-xs text-content-secondary">🏙️ {ci.name}</span>
                            {colorRow(ci, false)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {balanceHierarchy.offices.length === 0 && balanceHierarchy.countries.length === 0 && (
                  <p className="text-xs text-content-muted text-center py-2">Нет данных для детализации</p>
                )}
              </div>
            )}
          </Card>
        )}

        {/* Second panel depends on role */}
        {user.role === 'COUNTRY' && cityBalances.length > 0 ? (
          <Card
            title={`Баланс городов — ${citiesTotal} шт`}
            action={
              <button onClick={() => navigate('/balance')} className="text-xs text-brand-500 hover:text-brand-400 flex items-center gap-1">
                Подробнее <ArrowRight size={12} />
              </button>
            }
          >
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {cityBalances.map(({ city, balance: bal }) => {
                const total = (Number(bal?.BLACK) || 0) + (Number(bal?.WHITE) || 0) + (Number(bal?.RED) || 0) + (Number(bal?.BLUE) || 0);
                return (
                  <div key={city.id} className="flex items-center justify-between p-2.5 rounded-[var(--radius-sm)] hover:bg-surface-card-hover transition-colors">
                    <span className="text-sm font-medium text-content-primary">{city.name}</span>
                    <div className="flex items-center gap-2 text-xs tabular-nums text-content-secondary">
                      <span>⬛{bal?.BLACK || 0}</span>
                      <span>⬜{bal?.WHITE || 0}</span>
                      <span className="text-red-400">🟥{bal?.RED || 0}</span>
                      <span className="text-blue-400">🟦{bal?.BLUE || 0}</span>
                      <span className="font-bold text-content-primary ml-1">{total}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ) : (
          renderLossCard(isAdminOrOffice ? 'Минус компании по цветам' : 'Мои потери по цветам', lossSummary)
        )}
      </div>

      {/* ── COUNTRY: Own losses + Cities losses ──── */}
      {user.role === 'COUNTRY' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {renderLossCard('Мои потери по цветам', lossSummary)}
          {renderLossCard('Потери городов по цветам', citiesLossSummary)}
        </div>
      )}

      {/* ── ADMIN/OFFICE: System Losses ──── */}
      {isAdminOrOffice && systemMinus && (
        <Card
          title={`Минус по городам и странам — ${systemMinus.total} шт`}
          action={
            <div className="flex items-center gap-2">
              <button
                onClick={() => setLossExpanded(!lossExpanded)}
                className="text-xs text-content-muted hover:text-content-primary flex items-center gap-1 transition-colors"
              >
                {lossExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {lossExpanded ? 'Свернуть' : 'Развернуть'}
              </button>
              <span className="text-xs text-content-muted">
                Компания: {systemMinus.companyCount || 0} · Аккаунты: {systemMinus.shortageCount || 0}
              </span>
            </div>
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

          {/* Expandable loss hierarchy */}
          {lossExpanded && lossHierarchy.length > 0 && (
            <div className="mt-4 space-y-1 border-t border-edge pt-3">
              {lossHierarchy.map(entity => (
                <div key={entity.name}>
                  <div
                    onClick={() => toggleLossEntity(entity.name)}
                    className="flex items-center justify-between p-2 rounded-[var(--radius-sm)] hover:bg-surface-card-hover cursor-pointer transition-colors"
                  >
                    <span className="text-sm font-medium text-content-primary flex items-center gap-1">
                      {expandedLossCountries[entity.name] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      {entity.type === 'COMPANY' ? '🏢' : entity.entityType === 'CITY' ? '🏙️' : '🌍'} {entity.name}
                    </span>
                    <div className="flex items-center gap-2 text-xs tabular-nums text-content-secondary">
                      <span>⬛{entity.BLACK}</span><span>⬜{entity.WHITE}</span>
                      <span className="text-red-400">🟥{entity.RED}</span><span className="text-blue-400">🟦{entity.BLUE}</span>
                      <span className="font-bold text-red-400 ml-1">-{entity.total}</span>
                    </div>
                  </div>
                  {expandedLossCountries[entity.name] && (
                    <div className="ml-6 text-xs text-content-muted p-2">
                      <span className="inline-block px-2 py-0.5 rounded bg-surface-card-hover text-content-secondary">
                        {entity.type === 'COMPANY' ? 'Потеря компании' : 'Расхождение аккаунта'}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {lossExpanded && lossHierarchy.length === 0 && (
            <p className="mt-3 text-xs text-content-muted text-center py-2 border-t border-edge pt-3">Нет детализации</p>
          )}
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
