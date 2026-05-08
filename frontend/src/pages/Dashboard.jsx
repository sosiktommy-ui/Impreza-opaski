import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { useFilterStore, useBadgeStore } from '../store/useAppStore';
import { inventoryApi } from '../api/inventory';
import { transfersApi } from '../api/transfers';
import { usersApi } from '../api/users';
import { getSenderLabel, getReceiverLabel } from '../utils/transferHelpers';
import BraceletCard from '../components/ui/BraceletCard';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import {
  Send, PackageCheck, ArrowRight, Clock, CalendarDays, Boxes,
  AlertTriangle, TrendingDown, MinusCircle, PlusCircle,
  SlidersHorizontal, Gauge, BarChart3, ChevronDown, ChevronRight,
  Globe, MapPin, Building2, Activity, Package,
} from 'lucide-react';

/* ── helpers ───────────────────────────────────────────────────────── */
const timeAgo = (date) => {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин назад`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ч назад`;
  return `${Math.floor(hrs / 24)} д назад`;
};

const BRACELET_DOTS = {
  BLACK: 'bg-zinc-800 dark:bg-zinc-200',
  WHITE: 'bg-white border border-edge',
  RED:   'bg-red-500',
  BLUE:  'bg-blue-500',
};
const BRACELET_LABELS = { BLACK: 'Чёрные', WHITE: 'Белые', RED: 'Красные', BLUE: 'Синие' };
const TYPES = ['BLACK', 'WHITE', 'RED', 'BLUE'];

function BraceletRow({ black = 0, white = 0, red = 0, blue = 0 }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {[['BLACK', black], ['WHITE', white], ['RED', red], ['BLUE', blue]].map(([t, v]) => (
        <span key={t} className="flex items-center gap-1 text-xs tabular-nums">
          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${BRACELET_DOTS[t]}`} />
          <span className="font-semibold text-content-secondary">{v}</span>
        </span>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { user }                       = useAuthStore();
  const { countryId, cityId, eventId } = useFilterStore();
  const { pendingCount, problematicCount: badgeProblematic, incomingCount } = useBadgeStore();
  const navigate = useNavigate();

  const [balance,           setBalance]           = useState(null);
  const [rawInventory,      setRawInventory]       = useState([]);
  const [transfers,         setTransfers]          = useState([]);
  const [expenses,          setExpenses]           = useState([]);
  const [problematicCount,  setProblematicCount]   = useState(0);
  const [stats,             setStats]              = useState({ countries: 0, cities: 0 });
  const [lossSummary,       setLossSummary]        = useState(null);
  const [systemMinus,       setSystemMinus]        = useState(null);
  const [systemLossDetails, setSystemLossDetails]  = useState([]);
  const [cityBalances,      setCityBalances]       = useState([]);
  const [citiesLossSummary, setCitiesLossSummary]  = useState(null);
  const [loading,           setLoading]            = useState(true);

  const [balanceExpanded,       setBalanceExpanded]       = useState(false);
  const [expandedBalCountries,  setExpandedBalCountries]  = useState({});
  const [lossExpanded,          setLossExpanded]          = useState(false);
  const [expandedLossCountries, setExpandedLossCountries] = useState({});

  const isAdminOrOffice = user.role === 'ADMIN' || user.role === 'OFFICE';

  useEffect(() => { loadData(); }, [countryId, cityId, eventId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const fp = {};
      if (countryId) fp.countryId = countryId;
      if (cityId)    fp.cityId    = cityId;
      if (eventId)   fp.eventId   = eventId;

      if (isAdminOrOffice) {
        const [tR, cR, pR, eR, bR, lR, sLR, sLDR] = await Promise.all([
          transfersApi.getAll({ limit: 200, ...fp }),
          usersApi.getCountries(),
          transfersApi.getProblematic({ page: 1, limit: 5, ...fp }),
          inventoryApi.getExpenses({ limit: 100 }),
          inventoryApi.getAll(fp),
          inventoryApi.getCompanyLossesSummary(fp),
          inventoryApi.getSystemLossesSummary(),
          inventoryApi.getSystemLosses({ limit: 500 }).catch(() => ({ data: { data: [] } })),
        ]);
        const tList = tR.data?.data || tR.data;
        setTransfers(Array.isArray(tList) ? tList : (tList?.items || []));
        const cList = Array.isArray(cR.data?.data || cR.data) ? (cR.data?.data || cR.data) : [];
        setStats({ countries: cList.length, cities: cList.reduce((s, c) => s + (c.cities?.length || 0), 0) });
        const pData = pR.data;
        setProblematicCount(pData?.meta?.total || (pData?.data || []).length);
        const eList = eR.data?.data || eR.data || [];
        setExpenses(Array.isArray(eList) ? eList : []);
        const dPayload = bR.data?.data || bR.data;
        if (Array.isArray(dPayload)) {
          setRawInventory(dPayload);
          const tot = { BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 };
          dPayload.forEach((inv) => { if (tot[inv.itemType] !== undefined) tot[inv.itemType] += inv.quantity || 0; });
          setBalance(Object.entries(tot).map(([itemType, quantity]) => ({ itemType, quantity })));
        }
        setLossSummary(lR.data?.data || lR.data);
        setSystemMinus(sLR.data?.data || sLR.data);
        const ld = sLDR.data?.data || sLDR.data;
        setSystemLossDetails(Array.isArray(ld) ? ld : (ld?.data || []));

      } else if (user.role === 'COUNTRY' && user.countryId) {
        const [tR, pR, eR, cdR, olR, clR] = await Promise.all([
          transfersApi.getAll({ limit: 200, ...fp }),
          transfersApi.getProblematic({ page: 1, limit: 5, ...fp }),
          inventoryApi.getExpenses({ limit: 100 }),
          inventoryApi.getByCountry(user.countryId),
          inventoryApi.getCompanyLossesSummary({ scope: 'own' }),
          inventoryApi.getCompanyLossesSummary({ scope: 'cities' }),
        ]);
        const tList = tR.data?.data || tR.data;
        setTransfers(Array.isArray(tList) ? tList : (tList?.items || []));
        const pData = pR.data;
        setProblematicCount(pData?.meta?.total || (pData?.data || []).length);
        const eList = eR.data?.data || eR.data || [];
        setExpenses(Array.isArray(eList) ? eList : []);
        const cData = cdR.data?.data || cdR.data;
        if (cData) {
          const cb = cData.country;
          if (cb && typeof cb === 'object') {
            setBalance(TYPES.filter(k => k in cb).map(k => ({ itemType: k, quantity: Number(cb[k]) || 0 })));
          }
          if (Array.isArray(cData.cities)) setCityBalances(cData.cities);
        }
        setLossSummary(olR.data?.data || olR.data);
        setCitiesLossSummary(clR.data?.data || clR.data);

      } else {
        const eid = user.cityId;
        const [tR, pR, eR, bR, lR] = await Promise.all([
          transfersApi.getAll({ limit: 200, ...fp }),
          transfersApi.getProblematic({ page: 1, limit: 5, ...fp }),
          inventoryApi.getExpenses({ limit: 100 }),
          eid ? inventoryApi.getBalance('CITY', eid) : Promise.resolve(null),
          inventoryApi.getCompanyLossesSummary(),
        ]);
        const tList = tR.data?.data || tR.data;
        setTransfers(Array.isArray(tList) ? tList : (tList?.items || []));
        const pData = pR.data;
        setProblematicCount(pData?.meta?.total || (pData?.data || []).length);
        const eList = eR.data?.data || eR.data || [];
        setExpenses(Array.isArray(eList) ? eList : []);
        if (bR) {
          const dp = bR.data?.data || bR.data;
          if (dp && typeof dp === 'object' && !Array.isArray(dp)) {
            setBalance(TYPES.filter(k => k in dp || k.toLowerCase() in dp).map(k => ({
              itemType: k, quantity: Number(dp[k] ?? dp[k.toLowerCase()]) || 0,
            })));
          }
        }
        setLossSummary(lR.data?.data || lR.data);
      }
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  /* ── balance hierarchy (admin/office) ────────────────────────────── */
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

  /* ── loss hierarchy ───────────────────────────────────────────────── */
  const lossHierarchy = useMemo(() => {
    if (!systemLossDetails.length) return [];
    const grouped = {};
    systemLossDetails.forEach(loss => {
      const key = loss.entityName || 'Неизвестно';
      if (!grouped[key]) grouped[key] = { name: key, type: loss.type, entityType: loss.entityType, BLACK: 0, WHITE: 0, RED: 0, BLUE: 0, total: 0 };
      grouped[key].BLACK += loss.black || 0; grouped[key].WHITE += loss.white || 0;
      grouped[key].RED   += loss.red   || 0; grouped[key].BLUE  += loss.blue  || 0;
      grouped[key].total += loss.totalAmount || 0;
    });
    return Object.values(grouped).sort((a, b) => b.total - a.total);
  }, [systemLossDetails]);

  if (loading) return <DashboardSkeleton />;

  /* ── derived ─────────────────────────────────────────────────────── */
  const recentExpenses  = [...expenses].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6);
  const topExpenses     = [...expenses].sort((a, b) => ((b.black||0)+(b.white||0)+(b.red||0)+(b.blue||0)) - ((a.black||0)+(a.white||0)+(a.red||0)+(a.blue||0))).slice(0, 7);
  const systemTotal     = balance ? balance.reduce((s, b) => s + (b.quantity || 0), 0) : 0;
  const citiesTotal     = cityBalances.reduce((s, { balance: b }) => s + TYPES.reduce((t, k) => t + (Number(b?.[k]) || 0), 0), 0);
  const recentTransfers = [...transfers].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

  const toggleBalCountry = (id) => setExpandedBalCountries(p => ({ ...p, [id]: !p[id] }));
  const toggleLossEntity = (n)  => setExpandedLossCountries(p => ({ ...p, [n]: !p[n] }));

  const balanceTitle = user.role === 'ADMIN' ? 'Общий склад' :
                       user.role === 'OFFICE' ? 'Склад офиса' :
                       user.role === 'COUNTRY' ? 'Запасы страны' : 'Баланс города';

  /* ── quick actions ───────────────────────────────────────────────── */
  const quickActions = [
    { label: 'Новая отправка',      icon: Send,             path: '/transfers',             color: 'from-sky-500 to-blue-600',      roles: ['ADMIN', 'OFFICE', 'COUNTRY'] },
    { label: 'Вернуть браслеты',    icon: Send,             path: '/transfers',             color: 'from-sky-500 to-blue-600',      roles: ['CITY'] },
    { label: 'Добавить расход',     icon: CalendarDays,     path: '/expenses',              color: 'from-violet-500 to-purple-600', roles: ['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'] },
    { label: 'Входящие',            icon: PackageCheck,     path: '/acceptance',            color: 'from-emerald-500 to-green-600', roles: ['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'], badge: incomingCount },
    { label: 'Проблемные',          icon: AlertTriangle,    path: '/problematic',           color: 'from-orange-500 to-red-500',    roles: ['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'], badge: badgeProblematic },
    { label: 'Незавершённые',       icon: Clock,            path: '/pending',               color: 'from-amber-500 to-yellow-500',  roles: ['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'], badge: pendingCount },
    { label: 'Создать браслеты',    icon: PlusCircle,       path: '/warehouse',             color: 'from-teal-500 to-emerald-600',  roles: ['ADMIN', 'OFFICE'] },
    { label: 'Корректировка',       icon: SlidersHorizontal,path: '/balance',               color: 'from-indigo-500 to-violet-600', roles: ['ADMIN'] },
    { label: 'Статистика',          icon: BarChart3,        path: '/statistics',            color: 'from-pink-500 to-rose-600',     roles: ['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'] },
    { label: 'Баланс',              icon: Boxes,            path: '/balance',               color: 'from-amber-500 to-orange-500',  roles: ['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'] },
  ].filter(a => a.roles.includes(user.role));

  /* ── metric cards ────────────────────────────────────────────────── */
  const alerts = [];
  if (pendingCount > 0) alerts.push({ label: 'Незавершённые', value: pendingCount, icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10', ring: 'ring-amber-500/20', path: '/pending' });
  if (badgeProblematic > 0) alerts.push({ label: 'Проблемные', value: badgeProblematic, icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10', ring: 'ring-red-500/20', path: '/problematic' });
  if (incomingCount > 0) alerts.push({ label: 'Входящих', value: incomingCount, icon: PackageCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/20', path: '/acceptance' });

  const ROLE_ICON = { ADMIN: Globe, OFFICE: Building2, COUNTRY: MapPin, CITY: MapPin };
  const RoleIcon = ROLE_ICON[user.role] || Globe;
  const ROLE_LABEL = { ADMIN: 'Администратор', OFFICE: 'Офис', COUNTRY: 'Страна', CITY: 'Город' };
  const scopeName = user.city?.name || user.country?.name || user.office?.name || '';

  /* ── mini bracelet bar ────────────────────────────────────────────── */
  const MiniBar = ({ d }) => {
    const tot = (d.BLACK||0)+(d.WHITE||0)+(d.RED||0)+(d.BLUE||0);
    return (
      <div className="flex items-center gap-2">
        <BraceletRow black={d.BLACK||0} white={d.WHITE||0} red={d.RED||0} blue={d.BLUE||0} />
        <span className="text-xs font-bold text-content-primary ml-1">{tot}</span>
      </div>
    );
  };

  return (
    <div className="space-y-5">

      {/* ── HERO BANNER ─────────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-brand-600 via-brand-500 to-brand-400 rounded-2xl p-5 text-white shadow-lg">
        {/* decorative circles */}
        <div className="absolute -top-8 -right-8 w-40 h-40 bg-white/10 rounded-full pointer-events-none" />
        <div className="absolute top-4 right-20 w-16 h-16 bg-white/5 rounded-full pointer-events-none" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                <RoleIcon size={16} />
              </div>
              <span className="text-sm font-medium text-brand-100">{ROLE_LABEL[user.role] || user.role}</span>
              {scopeName && <span className="text-sm text-brand-200">· {scopeName}</span>}
            </div>
            <h1 className="text-2xl font-bold leading-tight">
              Добро пожаловать, {user.displayName || user.username}!
            </h1>
            <p className="text-brand-100 text-sm mt-1">
              {new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          {/* summary pill */}
          {systemTotal > 0 && (
            <div className="flex-shrink-0 bg-white/15 backdrop-blur-sm rounded-xl px-4 py-2.5 text-center">
              <div className="text-2xl font-bold tabular-nums">{systemTotal}</div>
              <div className="text-xs text-brand-100 whitespace-nowrap">браслетов всего</div>
            </div>
          )}
        </div>

        {/* alert pills inside banner */}
        {alerts.length > 0 && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {alerts.map(a => (
              <button
                key={a.label}
                onClick={() => navigate(a.path)}
                className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 transition-colors rounded-full px-3 py-1 text-xs font-semibold text-white"
              >
                <a.icon size={12} />
                {a.value} {a.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── TWO-COLUMN: Balance + Quick Actions ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Balance card — 3/5 */}
        <div className="lg:col-span-3">
          {balance && balance.length > 0 ? (
            <div className="bg-surface-card rounded-2xl border border-edge p-4 h-full">
              {/* header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-brand-500/10 flex items-center justify-center">
                    <Boxes size={14} className="text-brand-500" />
                  </div>
                  <span className="font-semibold text-content-primary text-sm">{balanceTitle}</span>
                  <span className="text-xs text-content-muted bg-surface-secondary px-2 py-0.5 rounded-full">{systemTotal} шт</span>
                </div>
                <div className="flex items-center gap-2">
                  {isAdminOrOffice && (
                    <button
                      onClick={() => setBalanceExpanded(!balanceExpanded)}
                      className="text-xs text-content-muted hover:text-content-primary flex items-center gap-1 transition-colors"
                    >
                      {balanceExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      {balanceExpanded ? 'Свернуть' : 'По офисам'}
                    </button>
                  )}
                  <button onClick={() => navigate('/balance')} className="text-xs text-brand-500 hover:text-brand-400 flex items-center gap-0.5 transition-colors">
                    Все <ArrowRight size={11} />
                  </button>
                </div>
              </div>

              {/* bracelet grid */}
              <div className="grid grid-cols-2 gap-2.5">
                {TYPES.map(type => {
                  const qty = balance.find(b => b.itemType === type)?.quantity || 0;
                  return <BraceletCard key={type} type={type} quantity={qty} total={systemTotal} />;
                })}
              </div>

              {/* expandable hierarchy */}
              {isAdminOrOffice && balanceExpanded && (
                <div className="mt-3 space-y-0.5 border-t border-edge pt-3">
                  {balanceHierarchy.offices.map(o => (
                    <div key={o.id} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-surface-secondary/50">
                      <span className="text-xs font-medium text-content-secondary flex items-center gap-1"><Building2 size={11} />{o.name}</span>
                      <MiniBar d={o} />
                    </div>
                  ))}
                  {balanceHierarchy.countries.map(c => (
                    <div key={c.id}>
                      <div onClick={() => toggleBalCountry(c.id)} className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-surface-card-hover cursor-pointer transition-colors">
                        <span className="text-xs font-medium text-content-primary flex items-center gap-1">
                          {expandedBalCountries[c.id] ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                          <Globe size={11} />{c.name}
                        </span>
                        <MiniBar d={c} />
                      </div>
                      {expandedBalCountries[c.id] && c.cities.map(ci => (
                        <div key={ci.id} className="flex items-center justify-between pl-8 pr-2 py-1 rounded-lg hover:bg-surface-card-hover/50 transition-colors">
                          <span className="text-xs text-content-muted flex items-center gap-1"><MapPin size={10} />{ci.name}</span>
                          <MiniBar d={ci} />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-surface-card rounded-2xl border border-edge p-6 h-full flex items-center justify-center">
              <div className="text-center text-content-muted">
                <Package size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Нет данных о балансе</p>
              </div>
            </div>
          )}
        </div>

        {/* Quick Actions — 2/5 */}
        <div className="lg:col-span-2">
          <div className="bg-surface-card rounded-2xl border border-edge p-4 h-full">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-brand-500/10 flex items-center justify-center">
                <Activity size={14} className="text-brand-500" />
              </div>
              <span className="font-semibold text-content-primary text-sm">Действия</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {quickActions.map(action => (
                <button
                  key={action.label}
                  onClick={() => navigate(action.path)}
                  className="group relative flex flex-col items-center gap-1.5 p-3 rounded-xl bg-surface-secondary hover:bg-surface-card-hover border border-transparent hover:border-edge transition-all"
                >
                  <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${action.color} flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm`}>
                    <action.icon size={16} className="text-white" />
                  </div>
                  <span className="text-[11px] font-medium text-content-secondary group-hover:text-content-primary text-center leading-tight transition-colors">{action.label}</span>
                  {action.badge > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
                      {action.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── COUNTRY: city balances ───────────────────────────────────── */}
      {user.role === 'COUNTRY' && cityBalances.length > 0 && (
        <div className="bg-surface-card rounded-2xl border border-edge p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <MapPin size={14} className="text-emerald-500" />
              </div>
              <span className="font-semibold text-content-primary text-sm">Баланс городов</span>
              <span className="text-xs text-content-muted bg-surface-secondary px-2 py-0.5 rounded-full">{citiesTotal} шт</span>
            </div>
            <button onClick={() => navigate('/balance')} className="text-xs text-brand-500 hover:text-brand-400 flex items-center gap-0.5">
              Все <ArrowRight size={11} />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {cityBalances.map(({ city, balance: bal }) => {
              const tot = TYPES.reduce((s, k) => s + (Number(bal?.[k]) || 0), 0);
              return (
                <div key={city.id} className="flex items-center justify-between p-2.5 rounded-xl bg-surface-secondary hover:bg-surface-card-hover transition-colors">
                  <span className="text-sm font-medium text-content-primary">{city.name}</span>
                  <div className="flex items-center gap-1.5">
                    <BraceletRow black={bal?.BLACK||0} white={bal?.WHITE||0} red={bal?.RED||0} blue={bal?.BLUE||0} />
                    <span className="text-xs font-bold text-content-primary ml-1">{tot}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── LOSSES SECTION ──────────────────────────────────────────── */}
      {(lossSummary || citiesLossSummary) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[
            { data: lossSummary,        title: isAdminOrOffice ? 'Потери компании' : user.role === 'COUNTRY' ? 'Мои потери' : 'Мои потери',  path: '/company-losses' },
            { data: citiesLossSummary,  title: 'Потери городов', path: '/company-losses' },
          ].filter(x => x.data && (x.data.total || 0) > 0).map(({ data, title, path }) => (
            <div key={title} className="bg-surface-card rounded-2xl border border-red-500/20 p-4 cursor-pointer hover:border-red-500/40 transition-colors" onClick={() => navigate(path)}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center">
                    <TrendingDown size={14} className="text-red-400" />
                  </div>
                  <span className="font-semibold text-content-primary text-sm">{title}</span>
                </div>
                <span className="text-xs text-red-400 font-bold">-{data.total}</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { k: 'black',  label: 'Чёрные', bg: 'bg-zinc-800',  text: 'text-zinc-200' },
                  { k: 'white',  label: 'Белые',  bg: 'bg-zinc-200 dark:bg-zinc-300', text: 'text-zinc-800' },
                  { k: 'red',    label: 'Красные',bg: 'bg-red-900/70', text: 'text-red-200' },
                  { k: 'blue',   label: 'Синие',  bg: 'bg-blue-900/70',text: 'text-blue-200' },
                ].map(c => (
                  <div key={c.k} className={`${c.bg} rounded-xl p-2.5 text-center`}>
                    <div className={`text-lg font-bold tabular-nums ${c.text}`}>-{data[c.k] || 0}</div>
                    <div className={`text-[10px] ${c.text} opacity-70`}>{c.label}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── ADMIN/OFFICE: system losses ─────────────────────────────── */}
      {isAdminOrOffice && systemMinus && (systemMinus.total || 0) > 0 && (
        <div className="bg-surface-card rounded-2xl border border-purple-500/20 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Gauge size={14} className="text-purple-400" />
              </div>
              <span className="font-semibold text-content-primary text-sm">Системные потери</span>
              <span className="text-xs text-content-muted bg-surface-secondary px-2 py-0.5 rounded-full">
                компания: {systemMinus.companyCount || 0} · аккаунты: {systemMinus.shortageCount || 0}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-purple-400">-{systemMinus.total}</span>
              <button onClick={() => setLossExpanded(!lossExpanded)} className="text-xs text-content-muted hover:text-content-primary flex items-center gap-0.5 transition-colors">
                {lossExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { k: 'black', bg: 'bg-zinc-900 dark:bg-zinc-800', text: 'text-zinc-300', label: 'Чёрные' },
              { k: 'white', bg: 'bg-zinc-100 dark:bg-zinc-400', text: 'text-zinc-700 dark:text-zinc-900', label: 'Белые' },
              { k: 'red',   bg: 'bg-red-900/60',   text: 'text-red-200',  label: 'Красные' },
              { k: 'blue',  bg: 'bg-blue-900/60',  text: 'text-blue-200', label: 'Синие' },
            ].map(c => (
              <div key={c.k} className={`${c.bg} rounded-xl p-2.5 text-center`}>
                <div className={`text-lg font-bold tabular-nums ${c.text}`}>{systemMinus[c.k] || 0}</div>
                <div className={`text-[10px] ${c.text} opacity-60`}>{c.label}</div>
              </div>
            ))}
          </div>
          {lossExpanded && lossHierarchy.length > 0 && (
            <div className="mt-3 space-y-0.5 border-t border-edge pt-3">
              {lossHierarchy.map(entity => (
                <div key={entity.name}>
                  <div onClick={() => toggleLossEntity(entity.name)} className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-surface-card-hover cursor-pointer transition-colors">
                    <span className="text-xs font-medium text-content-primary flex items-center gap-1">
                      {expandedLossCountries[entity.name] ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                      {entity.entityType === 'CITY' ? <MapPin size={10} /> : entity.entityType === 'COUNTRY' ? <Globe size={10} /> : <Building2 size={10} />}
                      {entity.name}
                    </span>
                    <div className="flex items-center gap-1.5 text-xs tabular-nums text-content-secondary">
                      <BraceletRow black={entity.BLACK} white={entity.WHITE} red={entity.RED} blue={entity.BLUE} />
                      <span className="font-bold text-red-400 ml-1">-{entity.total}</span>
                    </div>
                  </div>
                  {expandedLossCountries[entity.name] && (
                    <div className="ml-6 px-2 py-1">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-card-hover text-content-muted">
                        {entity.type === 'COMPANY' ? 'Потеря компании' : 'Расхождение аккаунта'}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── BOTTOM ROW: Recent activity ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Recent expenses */}
        <div className="bg-surface-card rounded-2xl border border-edge p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <CalendarDays size={14} className="text-violet-400" />
              </div>
              <span className="font-semibold text-content-primary text-sm">Последние расходы</span>
            </div>
            <button onClick={() => navigate('/expenses')} className="text-xs text-brand-500 hover:text-brand-400 flex items-center gap-0.5 transition-colors">
              Все <ArrowRight size={11} />
            </button>
          </div>
          {recentExpenses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-content-muted">
              <CalendarDays size={28} className="mb-2 opacity-25" />
              <p className="text-xs">Расходов пока нет</p>
            </div>
          ) : (
            <div className="space-y-1">
              {recentExpenses.map((ex) => {
                const total = (ex.black||0)+(ex.white||0)+(ex.red||0)+(ex.blue||0);
                return (
                  <div key={ex.id} className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-surface-secondary transition-colors">
                    <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                      <CalendarDays size={12} className="text-violet-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-content-primary truncate">{ex.eventName}</p>
                      <p className="text-[10px] text-content-muted">{ex.city?.name || ''}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="text-xs font-bold text-red-400">-{total}</span>
                      <p className="text-[10px] text-content-muted">{timeAgo(ex.createdAt)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent transfers */}
        <div className="bg-surface-card rounded-2xl border border-edge p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-sky-500/10 flex items-center justify-center">
                <Send size={14} className="text-sky-400" />
              </div>
              <span className="font-semibold text-content-primary text-sm">Последние отправки</span>
            </div>
            <button onClick={() => navigate('/transfers')} className="text-xs text-brand-500 hover:text-brand-400 flex items-center gap-0.5 transition-colors">
              Все <ArrowRight size={11} />
            </button>
          </div>
          {recentTransfers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-content-muted">
              <Send size={28} className="mb-2 opacity-25" />
              <p className="text-xs">Отправок пока нет</p>
            </div>
          ) : (
            <div className="space-y-1">
              {recentTransfers.map((t) => {
                const total = (t.items || []).reduce((s, i) => s + (i.quantity || 0), 0);
                const STATUS_COLOR = { SENT: 'text-sky-400', ACCEPTED: 'text-emerald-400', REJECTED: 'text-red-400', DISCREPANCY_FOUND: 'text-amber-400', CANCELLED: 'text-gray-400' };
                const STATUS_LABEL = { SENT: 'Отправлен', ACCEPTED: 'Принят', REJECTED: 'Отклонён', DISCREPANCY_FOUND: 'Расхождение', CANCELLED: 'Отменён' };
                const from = getSenderLabel(t);
                const to   = getReceiverLabel(t);
                const creator = t.createdByUser?.displayName || t.createdByUser?.username || null;
                return (
                  <div key={t.id} className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-surface-secondary transition-colors">
                    <div className="w-7 h-7 rounded-lg bg-sky-500/10 flex items-center justify-center flex-shrink-0">
                      <Send size={12} className="text-sky-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 text-xs font-medium text-content-primary">
                        <span className="truncate max-w-[70px]">{from}</span>
                        <ArrowRight size={9} className="text-content-muted flex-shrink-0" />
                        <span className="truncate max-w-[70px]">{to}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-medium ${STATUS_COLOR[t.status] || 'text-content-muted'}`}>{STATUS_LABEL[t.status] || t.status}</span>
                        {creator && <span className="text-[10px] text-content-muted">· {creator}</span>}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="text-xs font-bold text-content-secondary">{total} шт</span>
                      <p className="text-[10px] text-content-muted">{timeAgo(t.createdAt)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── TOP EXPENSES TABLE ───────────────────────────────────────── */}
      {topExpenses.length > 0 && (
        <div className="bg-surface-card rounded-2xl border border-edge p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <BarChart3 size={14} className="text-amber-500" />
              </div>
              <span className="font-semibold text-content-primary text-sm">Топ расходов по объёму</span>
            </div>
            <button onClick={() => navigate('/expenses')} className="text-xs text-brand-500 hover:text-brand-400 flex items-center gap-0.5 transition-colors">
              Все <ArrowRight size={11} />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-content-muted border-b border-edge">
                  <th className="text-left py-1.5 pr-3 font-medium">Событие</th>
                  <th className="text-right py-1.5 px-2 font-medium">
                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-700 dark:bg-zinc-200 inline-block" />
                  </th>
                  <th className="text-right py-1.5 px-2 font-medium">
                    <span className="w-2.5 h-2.5 rounded-full bg-white border border-edge inline-block" />
                  </th>
                  <th className="text-right py-1.5 px-2 font-medium">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
                  </th>
                  <th className="text-right py-1.5 px-2 font-medium">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                  </th>
                  <th className="text-right py-1.5 pl-2 font-medium text-content-secondary">Итого</th>
                </tr>
              </thead>
              <tbody>
                {topExpenses.map((ex, i) => {
                  const total = (ex.black||0)+(ex.white||0)+(ex.red||0)+(ex.blue||0);
                  return (
                    <tr key={ex.id} className="border-b border-edge/40 hover:bg-surface-secondary/50 transition-colors">
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-content-muted w-4 tabular-nums">{i + 1}.</span>
                          <div>
                            <p className="font-medium text-content-primary truncate max-w-[160px]">{ex.eventName}</p>
                            {ex.city?.name && <p className="text-[10px] text-content-muted">{ex.city.name}</p>}
                          </div>
                        </div>
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
        </div>
      )}

    </div>
  );
}
