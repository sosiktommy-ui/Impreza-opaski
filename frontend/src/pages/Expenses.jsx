import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useFilterStore } from '../store/useAppStore';
import { inventoryApi } from '../api/inventory';
import { usersApi } from '../api/users';
import { accessApi } from '../api/access';
import { eventsApi } from '../api/events';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import {
  CalendarDays, Plus, Search, TrendingDown,
  MapPin, BarChart3, Trash2, ArrowRight, Home,
  Globe, ExternalLink, Package, ChevronDown, ChevronUp,
  Building2, AlertCircle, CheckCircle2,
} from 'lucide-react';

const ITEM_LABELS = { BLACK: 'Чёрные', WHITE: 'Белые', RED: 'Красные', BLUE: 'Синие' };
const BRACELET_KEYS = ['black', 'white', 'red', 'blue'];
const BRACELET_COLORS = {
  black: 'bg-gray-800 dark:bg-gray-200',
  white: 'bg-gray-300 dark:bg-gray-500 border border-gray-400',
  red:   'bg-red-500',
  blue:  'bg-blue-500',
};

const EXPENSE_TYPE_META = {
  INTERNAL: { label: 'Внутренний', bgClass: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', dotClass: 'bg-emerald-400', Icon: Home },
  EXTERNAL: { label: 'Внешний',   bgClass: 'bg-sky-500/10 text-sky-500 border-sky-500/20',             dotClass: 'bg-sky-400',     Icon: ExternalLink },
  THIRD:    { label: 'Сторонний', bgClass: 'bg-gray-500/10 text-gray-400 border-gray-500/20',          dotClass: 'bg-gray-400',    Icon: Globe },
};

const ROLE_LABELS = { ADMIN: 'Админ', OFFICE: 'Офис', COUNTRY: 'Страна', CITY: 'Город' };

function StatCard({ icon: Icon, iconBg, iconColor, value, label }) {
  return (
    <div className="bg-surface-card rounded-xl border border-edge p-4 flex items-center gap-3">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        <Icon size={20} className={iconColor} />
      </div>
      <div>
        <div className="text-2xl font-bold text-content-primary leading-none">{value}</div>
        <div className="text-xs text-content-muted mt-0.5">{label}</div>
      </div>
    </div>
  );
}

function BraceletDots({ black = 0, white = 0, red = 0, blue = 0, size = 'md' }) {
  const dot = size === 'sm' ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5';
  const items = [
    { key: 'black', val: black, cls: 'bg-gray-800 dark:bg-gray-200' },
    { key: 'white', val: white, cls: 'bg-gray-300 dark:bg-gray-500 border border-gray-400 dark:border-gray-600' },
    { key: 'red',   val: red,   cls: 'bg-red-500' },
    { key: 'blue',  val: blue,  cls: 'bg-blue-500' },
  ].filter(i => i.val > 0);
  if (items.length === 0) return null;
  return (
    <div className="flex items-center gap-2.5 flex-wrap">
      {items.map(({ key, val, cls }) => (
        <span key={key} className="flex items-center gap-1">
          <span className={`${dot} rounded-full ${cls} flex-shrink-0`} />
          <span className="text-sm font-semibold text-content-primary">{val}</span>
        </span>
      ))}
    </div>
  );
}

export default function Expenses() {
  const { user } = useAuthStore();
  const { countryId: globalCountryId, cityId: globalCityId } = useFilterStore();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [countries, setCountries] = useState([]);
  const [cities, setCities] = useState([]);
  const [selectedCountryId, setSelectedCountryId] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [expandedCards, setExpandedCards] = useState({});

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCity, setFilterCity] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [sortOrder, setSortOrder] = useState('newest');

  // Form
  const [cityId, setCityId] = useState('');
  const [expenseType, setExpenseType] = useState('INTERNAL');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [quantities, setQuantities] = useState({ black: '', white: '', red: '', blue: '' });
  const [notes, setNotes] = useState('');
  const [targetCityId, setTargetCityId] = useState('');
  const [targetCountryId, setTargetCountryId] = useState('');
  const [targetCitiesForAdmin, setTargetCitiesForAdmin] = useState([]);
  const [accessibleCities, setAccessibleCities] = useState([]);

  // Events
  const [imprezaEvents, setImprezaEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [loadingEvents, setLoadingEvents] = useState(false);

  // Balance
  const [cityBalance, setCityBalance] = useState(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    loadExpenses();
    loadCountries();
    loadCities();
  }, [globalCountryId, globalCityId]);

  const loadExpenses = async () => {
    try {
      const params = { limit: 200 };
      if (globalCountryId) params.countryId = globalCountryId;
      if (globalCityId) { params.cityId = globalCityId; params.includeTargeted = true; }
      const { data } = await inventoryApi.getExpenses(params);
      const list = Array.isArray(data) ? data : (data?.data || []);
      setExpenses(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadCountries = async () => {
    if (['ADMIN', 'OFFICE', 'COUNTRY'].includes(user.role)) {
      try {
        const { data } = await usersApi.getCountries();
        const list = data?.data || data;
        setCountries(Array.isArray(list) ? list : []);
      } catch {}
    }
  };

  const loadCities = async (countryIdParam) => {
    if (['ADMIN', 'OFFICE', 'COUNTRY'].includes(user.role)) {
      try {
        const cid = user.role === 'COUNTRY' ? user.countryId : countryIdParam;
        const { data } = await usersApi.getCities(cid);
        const list = data?.data || data;
        setCities(Array.isArray(list) ? list : []);
      } catch {}
    }
  };

  const loadCityBalance = async (cid) => {
    if (!cid) { setCityBalance(null); return; }
    setLoadingBalance(true);
    try {
      const { data } = await inventoryApi.getBalance('CITY', cid);
      const raw = data?.data || data;
      if (Array.isArray(raw)) {
        const bal = { black: 0, white: 0, red: 0, blue: 0 };
        raw.forEach(item => { if (item.itemType) bal[item.itemType.toLowerCase()] = item.quantity || 0; });
        setCityBalance(bal);
      } else if (raw && typeof raw === 'object') {
        setCityBalance({
          black: raw.black ?? raw.BLACK ?? 0,
          white: raw.white ?? raw.WHITE ?? 0,
          red:   raw.red   ?? raw.RED   ?? 0,
          blue:  raw.blue  ?? raw.BLUE  ?? 0,
        });
      }
    } catch { setCityBalance(null); }
    finally { setLoadingBalance(false); }
  };

  const loadEvents = async () => {
    setLoadingEvents(true);
    try {
      const { data } = await eventsApi.getEvents({ active: false });
      const list = Array.isArray(data) ? data : (data?.data || []);
      setImprezaEvents(Array.isArray(list) ? list : []);
    } catch { setImprezaEvents([]); }
    finally { setLoadingEvents(false); }
  };

  const loadAccessibleCities = async () => {
    try {
      const { data } = await accessApi.getMy();
      const list = Array.isArray(data) ? data : (data?.accesses ?? data?.data?.accesses ?? data ?? []);
      const accesses = Array.isArray(list) ? list : [];
      const c = accesses
        .filter(a => !a.revokedAt && !(a.expiresAt && new Date(a.expiresAt) < new Date()))
        .filter(a => a.scopeType === 'CITY')
        .map(a => ({ id: a.scopeId, name: a.target?.name || a.scopeId }));
      setAccessibleCities(c);
    } catch { setAccessibleCities([]); }
  };

  // ── Stats ─────────────────────────────────────────
  const stats = useMemo(() => {
    const totalEvents = expenses.length;
    let totalBracelets = 0;
    const byColor = { BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 };
    const cityMap = {};
    expenses.forEach((ex) => {
      const b = (ex.black || 0) + (ex.white || 0) + (ex.red || 0) + (ex.blue || 0);
      totalBracelets += b;
      byColor.BLACK += ex.black || 0;
      byColor.WHITE += ex.white || 0;
      byColor.RED   += ex.red   || 0;
      byColor.BLUE  += ex.blue  || 0;
      const cn = ex.city?.name || 'Неизвестно';
      cityMap[cn] = (cityMap[cn] || 0) + b;
    });
    const topCity = Object.entries(cityMap).sort((a,b) => b[1]-a[1])[0];
    const avg = totalEvents > 0 ? Math.round(totalBracelets / totalEvents) : 0;
    const byType = {
      INTERNAL: expenses.filter((ex) => (ex.type || 'INTERNAL') === 'INTERNAL').length,
      EXTERNAL: expenses.filter((ex) => ex.type === 'EXTERNAL').length,
      THIRD:    expenses.filter((ex) => ex.type === 'THIRD').length,
    };
    return { totalEvents, totalBracelets, avg, byColor, byType, topCity };
  }, [expenses]);

  // ── Filtered & sorted ────────────────────────────
  const filteredExpenses = useMemo(() => {
    let list = [...expenses];
    if (filterType !== 'all') list = list.filter((ex) => (ex.type || 'INTERNAL') === filterType);
    if (filterCity !== 'all') list = list.filter((ex) => ex.city?.name === filterCity || ex.cityId === filterCity);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((ex) =>
        (ex.eventName || '').toLowerCase().includes(q) ||
        (ex.location  || '').toLowerCase().includes(q) ||
        (ex.city?.name || '').toLowerCase().includes(q) ||
        (ex.targetCity?.name || '').toLowerCase().includes(q),
      );
    }
    list.sort((a, b) => {
      if (sortOrder === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
      if (sortOrder === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
      const at = (a.black||0)+(a.white||0)+(a.red||0)+(a.blue||0);
      const bt = (b.black||0)+(b.white||0)+(b.red||0)+(b.blue||0);
      return sortOrder === 'most' ? bt - at : at - bt;
    });
    return list;
  }, [expenses, filterType, filterCity, searchQuery, sortOrder]);

  const cityNames = useMemo(() => {
    const names = new Set();
    expenses.forEach((ex) => { if (ex.city?.name) names.add(ex.city.name); });
    return [...names].sort();
  }, [expenses]);

  const openCreate = async () => {
    setShowCreate(true);
    setError('');
    setSelectedCountryId('');
    setExpenseType('INTERNAL');
    setCityBalance(null);
    setTargetCityId('');
    setTargetCountryId('');
    setTargetCitiesForAdmin([]);
    setAccessibleCities([]);
    setDescription('');
    setEventDate('');
    setSelectedEventId('');
    setImprezaEvents([]);
    if (user.role === 'CITY') {
      setCityId(user.cityId);
      await Promise.all([loadCityBalance(user.cityId), loadAccessibleCities(), loadEvents()]);
    } else {
      loadEvents();
    }
  };

  const handleCountryChange = async (e) => {
    const cid = e.target.value;
    setSelectedCountryId(cid);
    setCityId('');
    setCityBalance(null);
    if (cid) await loadCities(cid);
    else await loadCities();
  };

  const handleCityChange = async (e) => {
    const id = e.target.value;
    setCityId(id);
    await loadCityBalance(id);
  };

  const handleTargetCountryChange = async (e) => {
    const cid = e.target.value;
    setTargetCountryId(cid);
    setTargetCityId('');
    setSelectedEventId('');
    setDescription('');
    if (!cid) { setTargetCitiesForAdmin([]); return; }
    try {
      const { data } = await usersApi.getCities(cid);
      const list = data?.data || data;
      setTargetCitiesForAdmin(Array.isArray(list) ? list : []);
    } catch { setTargetCitiesForAdmin([]); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const sourceCityId = user.role === 'CITY' ? user.cityId : cityId;
    if (!sourceCityId) { setError('Выберите город-источник'); return; }
    if (!description.trim()) { setError('Укажите описание расхода'); return; }
    if (expenseType === 'EXTERNAL') {
      if (!targetCityId) { setError('Выберите целевой город'); return; }
      if (targetCityId === sourceCityId) { setError('Целевой город совпадает с источником'); return; }
    }
    const black = parseInt(quantities.black) || 0;
    const white = parseInt(quantities.white) || 0;
    const red   = parseInt(quantities.red)   || 0;
    const blue  = parseInt(quantities.blue)  || 0;
    if (black + white + red + blue === 0) { setError('Укажите количество браслетов'); return; }
    if (cityBalance) {
      const over = [];
      if (black > (cityBalance.black || 0)) over.push(`чёрных (есть: ${cityBalance.black})`);
      if (white > (cityBalance.white || 0)) over.push(`белых (есть: ${cityBalance.white})`);
      if (red   > (cityBalance.red   || 0)) over.push(`красных (есть: ${cityBalance.red})`);
      if (blue  > (cityBalance.blue  || 0)) over.push(`синих (есть: ${cityBalance.blue})`);
      if (over.length) { setError(`Недостаточно: ${over.join(', ')}`); return; }
    }
    setSending(true);
    try {
      await inventoryApi.createExpense({
        cityId: sourceCityId,
        eventName: description.trim(),
        eventDate: eventDate || undefined,
        type: expenseType,
        targetCityId: expenseType === 'EXTERNAL' ? targetCityId : undefined,
        black, white, red, blue,
        notes: notes.trim() || undefined,
      });
      setShowCreate(false);
      resetForm();
      setSuccessMsg('Расход записан');
      setTimeout(() => setSuccessMsg(''), 3000);
      await loadExpenses();
    } catch (err) {
      setError(err.response?.data?.message || 'Ошибка создания расхода');
    } finally {
      setSending(false);
    }
  };

  const resetForm = () => {
    setCityId(user.role === 'CITY' ? user.cityId : '');
    setSelectedCountryId('');
    setExpenseType('INTERNAL');
    setDescription('');
    setEventDate('');
    setQuantities({ black: '', white: '', red: '', blue: '' });
    setNotes('');
    setError('');
    setCityBalance(null);
    setTargetCityId('');
    setTargetCountryId('');
    setTargetCitiesForAdmin([]);
    setAccessibleCities([]);
    setSelectedEventId('');
    setImprezaEvents([]);
  };

  const handleDelete = async (id) => {
    if (!confirm('Удалить расход? Браслеты вернутся на баланс.')) return;
    try {
      await inventoryApi.deleteExpense(id);
      await loadExpenses();
    } catch (err) {
      alert(err.response?.data?.message || 'Ошибка удаления');
    }
  };

  const toggleCard = (id) => setExpandedCards(p => ({ ...p, [id]: !p[id] }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-brand-200 border-t-brand-600 rounded-full" />
      </div>
    );
  }

  // ── Event filter logic for form ─────────────────
  const getEventsForCity = () => {
    let filterCityName = null;
    if (expenseType === 'INTERNAL') {
      filterCityName = user.role === 'CITY'
        ? (user.city?.name || null)
        : (cities.find((c) => c.id === cityId)?.name || null);
    } else {
      const obj = accessibleCities.find(c => c.id === targetCityId) || targetCitiesForAdmin.find(c => c.id === targetCityId);
      filterCityName = obj?.name || null;
    }
    return filterCityName
      ? imprezaEvents.filter(ev => !ev.city || ev.city.toLowerCase().includes(filterCityName.toLowerCase()))
      : imprezaEvents;
  };

  const sourceCityName = user.role === 'CITY'
    ? (user.city?.name || 'Ваш город')
    : (cities.find(c => c.id === cityId)?.name || null);

  const targetCityName =
    accessibleCities.find(c => c.id === targetCityId)?.name ||
    targetCitiesForAdmin.find(c => c.id === targetCityId)?.name || null;

  return (
    <div className="space-y-5">

      {/* ── Header ───────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-content-primary flex items-center gap-2">
            <TrendingDown size={22} className="text-brand-500" /> Расходы браслетов
          </h2>
          <p className="text-xs text-content-muted mt-0.5">Учёт расхода по событиям — каждый расход привязан к городу и мероприятию</p>
        </div>
        {['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'].includes(user.role) && (
          <Button onClick={openCreate} size="sm">
            <Plus size={16} /> Новый расход
          </Button>
        )}
      </div>

      {/* ── Stats row ────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={CalendarDays}  iconBg="bg-violet-500/10"  iconColor="text-violet-500"  value={stats.totalEvents}     label="Мероприятий" />
        <StatCard icon={TrendingDown}  iconBg="bg-red-500/10"     iconColor="text-red-500"     value={stats.totalBracelets}  label="Израсходовано" />
        <StatCard icon={BarChart3}     iconBg="bg-blue-500/10"    iconColor="text-blue-500"    value={stats.avg}             label="В среднем" />
        <StatCard icon={MapPin}        iconBg="bg-amber-500/10"   iconColor="text-amber-500"   value={cityNames.length}      label="Городов" />
      </div>

      {/* ── Color breakdown ───────────────────────────── */}
      {stats.totalBracelets > 0 && (
        <div className="bg-surface-card rounded-xl border border-edge p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-content-secondary uppercase tracking-wide">Разбивка по цветам</span>
            <span className="text-xs text-content-muted">{stats.totalBracelets} шт</span>
          </div>
          <div className="flex h-2.5 rounded-full overflow-hidden gap-px">
            {[
              { key: 'BLACK', color: 'bg-gray-800 dark:bg-gray-200' },
              { key: 'WHITE', color: 'bg-gray-300 dark:bg-gray-500' },
              { key: 'RED',   color: 'bg-red-500' },
              { key: 'BLUE',  color: 'bg-blue-500' },
            ].filter(c => stats.byColor[c.key] > 0).map(c => (
              <div
                key={c.key}
                className={`${c.color} transition-all first:rounded-l-full last:rounded-r-full`}
                style={{ width: `${(stats.byColor[c.key] / stats.totalBracelets) * 100}%` }}
                title={`${ITEM_LABELS[c.key]}: ${stats.byColor[c.key]}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs text-content-secondary flex-wrap">
            {[
              { key: 'BLACK', dot: 'bg-gray-800 dark:bg-gray-200', label: 'Чёрные' },
              { key: 'WHITE', dot: 'bg-gray-300 dark:bg-gray-500 border border-gray-400', label: 'Белые' },
              { key: 'RED',   dot: 'bg-red-500',  label: 'Красные' },
              { key: 'BLUE',  dot: 'bg-blue-500', label: 'Синие' },
            ].map(c => (
              <span key={c.key} className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
                {c.label}: <strong className="text-content-primary">{stats.byColor[c.key]}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Type tabs + filters ───────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        {/* Type tabs */}
        <div className="flex items-center gap-0.5 bg-surface-secondary rounded-xl p-1 flex-wrap">
          {[
            { key: 'all',      label: 'Все',        count: stats.totalEvents },
            { key: 'INTERNAL', label: 'Внутренние', count: stats.byType.INTERNAL },
            { key: 'EXTERNAL', label: 'Внешние',    count: stats.byType.EXTERNAL },
            ...(stats.byType.THIRD > 0 ? [{ key: 'THIRD', label: 'Сторонние', count: stats.byType.THIRD }] : []),
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setFilterType(t.key)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                filterType === t.key
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-content-secondary hover:text-content-primary hover:bg-surface-card'
              }`}
            >
              {t.label}
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${filterType === t.key ? 'bg-white/20' : 'bg-surface-card text-content-muted'}`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search + sort */}
        <div className="flex gap-2 flex-1 min-w-0">
          <div className="relative flex-1 min-w-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
            <input
              type="text"
              placeholder="Поиск по названию, городу..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 rounded-xl border border-edge bg-surface-card text-content-primary text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
            />
          </div>
          {cityNames.length > 1 && (
            <select
              value={filterCity}
              onChange={e => setFilterCity(e.target.value)}
              className="rounded-xl border border-edge text-sm px-3 py-2 bg-surface-card text-content-primary focus:border-brand-500 focus:outline-none"
            >
              <option value="all">Все города</option>
              {cityNames.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          )}
          <select
            value={sortOrder}
            onChange={e => setSortOrder(e.target.value)}
            className="rounded-xl border border-edge text-sm px-3 py-2 bg-surface-card text-content-primary focus:border-brand-500 focus:outline-none"
          >
            <option value="newest">Новые ↓</option>
            <option value="oldest">Старые ↑</option>
            <option value="most">Больше шт</option>
            <option value="least">Меньше шт</option>
          </select>
        </div>
      </div>

      {/* ── Expenses list ─────────────────────────────── */}
      {filteredExpenses.length === 0 ? (
        <div className="text-center py-16 bg-surface-card rounded-xl border border-edge">
          <Package size={44} className="mx-auto mb-3 text-content-muted opacity-30" />
          <p className="font-medium text-content-secondary">
            {expenses.length === 0 ? 'Расходов пока нет' : 'Ничего не найдено'}
          </p>
          {expenses.length === 0 && (
            <p className="text-sm text-content-muted mt-1">Нажмите «Новый расход» чтобы записать первый</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredExpenses.map((ex) => {
            const total = (ex.black||0)+(ex.white||0)+(ex.red||0)+(ex.blue||0);
            const meta = EXPENSE_TYPE_META[ex.type] ?? EXPENSE_TYPE_META.INTERNAL;
            const TypeIcon = meta.Icon;
            const actor = ex.actorUser;
            const isExternal = ex.type === 'EXTERNAL';
            const expanded = !!expandedCards[ex.id];
            const dateStr = ex.eventDate && !isNaN(new Date(ex.eventDate).getTime())
              ? new Date(ex.eventDate).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' })
              : new Date(ex.createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });

            return (
              <div
                key={ex.id}
                className="bg-surface-card rounded-xl border border-edge overflow-hidden hover:shadow-sm transition-shadow"
              >
                {/* ── Card main row ── */}
                <div className="flex items-stretch gap-0">
                  {/* Left color stripe */}
                  <div className={`w-1 flex-shrink-0 ${meta.dotClass}`} />

                  <div className="flex-1 px-4 py-3.5">
                    {/* Top row: event name + date + total */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CalendarDays size={14} className="text-violet-400 flex-shrink-0" />
                          <span className="font-semibold text-content-primary text-sm leading-tight truncate">
                            {ex.eventName}
                          </span>
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${meta.bgClass}`}>
                            <TypeIcon size={9} /> {meta.label}
                          </span>
                        </div>

                        {/* City / direction */}
                        <div className="flex items-center gap-1.5 mt-1.5 text-xs">
                          {isExternal ? (
                            <span className="flex items-center gap-1 text-sky-400 font-medium">
                              <MapPin size={11} className="text-content-muted" />
                              <span className="text-content-secondary">{ex.city?.name || '?'}</span>
                              <ArrowRight size={11} />
                              <span className="font-semibold">{ex.targetCity?.name || '?'}</span>
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-content-muted">
                              <MapPin size={11} />
                              <span className="font-medium text-content-secondary">{ex.city?.name || 'Город'}</span>
                            </span>
                          )}
                          {actor && (
                            <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400 font-medium ml-1">
                              {actor.displayName || actor.username}
                              <span className="opacity-60">· {ROLE_LABELS[actor.role] || actor.role}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex-shrink-0 text-right">
                        <div className="text-[11px] text-content-muted">{dateStr}</div>
                        <div className="text-base font-bold text-red-500 flex items-center gap-1 justify-end mt-0.5">
                          <TrendingDown size={13} />
                          {total} шт
                        </div>
                      </div>
                    </div>

                    {/* Bracelets row */}
                    <div className="mt-2.5 flex items-center justify-between gap-3">
                      <BraceletDots black={ex.black} white={ex.white} red={ex.red} blue={ex.blue} />
                      <div className="flex items-center gap-1.5">
                        {ex.notes && (
                          <button
                            type="button"
                            onClick={() => toggleCard(ex.id)}
                            className="text-[11px] text-content-muted hover:text-content-primary flex items-center gap-1"
                          >
                            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            Заметка
                          </button>
                        )}
                        {(user.role === 'ADMIN' || user.role === 'OFFICE') && (
                          <button
                            onClick={() => handleDelete(ex.id)}
                            className="p-1.5 rounded-lg hover:bg-red-500/10 text-content-muted hover:text-red-500 transition-colors"
                            title="Удалить расход"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expanded notes */}
                    {expanded && ex.notes && (
                      <div className="mt-2 px-3 py-2 bg-surface-secondary rounded-lg text-xs text-content-secondary italic border-l-2 border-brand-500/30">
                        {ex.notes}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Footer summary ───────────────────────────── */}
      {filteredExpenses.length > 0 && (
        <div className="flex items-center justify-between bg-surface-card rounded-xl px-4 py-3 border border-edge">
          <span className="text-xs text-content-muted">
            {filteredExpenses.length === expenses.length
              ? `Всего ${expenses.length} расходов`
              : `Показано ${filteredExpenses.length} из ${expenses.length}`}
          </span>
          <span className="text-sm font-bold text-content-primary flex items-center gap-1.5">
            <TrendingDown size={14} className="text-red-500" />
            {filteredExpenses.reduce((s, ex) => s + (ex.black||0)+(ex.white||0)+(ex.red||0)+(ex.blue||0), 0)} браслетов
          </span>
        </div>
      )}

      {/* ── Success toast ─────────────────────────────── */}
      {successMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white text-sm px-5 py-2.5 rounded-full shadow-lg pointer-events-none flex items-center gap-2">
          <CheckCircle2 size={16} /> {successMsg}
        </div>
      )}

      {/* ── Create modal ─────────────────────────────── */}
      <Modal
        open={showCreate}
        onClose={() => { setShowCreate(false); resetForm(); }}
        title="Новый расход браслетов"
      >
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Expense type */}
          <div>
            <p className="text-xs font-semibold text-content-muted uppercase tracking-wide mb-2">Тип расхода</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  key: 'INTERNAL', icon: Home, label: 'Внутренний',
                  desc: 'Расход для своего города',
                  active: 'border-emerald-500 bg-emerald-500/5 text-emerald-600',
                },
                {
                  key: 'EXTERNAL', icon: ExternalLink, label: 'Внешний',
                  desc: 'Браслеты уходят в другой город',
                  active: 'border-sky-500 bg-sky-500/5 text-sky-600',
                },
              ].map(({ key, icon: Icon, label, desc, active }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setExpenseType(key); setTargetCityId(''); setTargetCountryId(''); setTargetCitiesForAdmin([]); }}
                  className={`flex items-start gap-2.5 p-3 rounded-xl border-2 text-left transition-all ${
                    expenseType === key ? active : 'border-edge text-content-secondary hover:border-brand-500/30'
                  }`}
                >
                  <Icon size={16} className="mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-xs font-semibold">{label}</div>
                    <div className="text-[10px] text-content-muted mt-0.5 leading-tight">{desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Source city */}
          {user.role === 'CITY' ? (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-surface-secondary rounded-xl border border-edge text-sm">
              <MapPin size={14} className="text-brand-500 flex-shrink-0" />
              <span className="text-content-muted text-xs">Источник:</span>
              <span className="font-semibold text-content-primary">{user.city?.name || 'Ваш город'}</span>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-content-muted uppercase tracking-wide">Источник (откуда снимается баланс)</p>
              {countries.length > 0 && (
                <select
                  value={selectedCountryId}
                  onChange={handleCountryChange}
                  className="w-full rounded-xl border border-edge text-sm px-3 py-2.5 bg-surface-card text-content-primary focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
                >
                  <option value="">— Страна —</option>
                  {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              {cities.length > 0 && (
                <select
                  value={cityId}
                  onChange={handleCityChange}
                  required
                  className="w-full rounded-xl border border-edge text-sm px-3 py-2.5 bg-surface-card text-content-primary focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
                >
                  <option value="">— Город —</option>
                  {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
            </div>
          )}

          {/* Target city (EXTERNAL) */}
          {expenseType === 'EXTERNAL' && (
            <div className="space-y-2 p-3.5 rounded-xl border-2 border-sky-500/30 bg-sky-500/5">
              <p className="text-xs font-semibold text-sky-500 flex items-center gap-1.5">
                <ArrowRight size={13} /> Куда идут браслеты (целевой город)
              </p>
              {user.role === 'CITY' ? (
                accessibleCities.length > 0 ? (
                  <select
                    value={targetCityId}
                    onChange={e => { setTargetCityId(e.target.value); setSelectedEventId(''); setDescription(''); }}
                    required
                    className="w-full rounded-xl border border-edge text-sm px-3 py-2.5 bg-surface-card text-content-primary focus:border-brand-500 focus:outline-none"
                  >
                    <option value="">— Выберите город —</option>
                    {accessibleCities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 px-3 py-2 rounded-lg">
                    <AlertCircle size={13} />
                    Нет доступа к другим городам — обратитесь к администратору
                  </div>
                )
              ) : (
                <>
                  <select
                    value={targetCountryId}
                    onChange={handleTargetCountryChange}
                    className="w-full rounded-xl border border-edge text-sm px-3 py-2.5 bg-surface-card text-content-primary focus:border-brand-500 focus:outline-none"
                  >
                    <option value="">— Страна цели —</option>
                    {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {targetCountryId && (
                    <select
                      value={targetCityId}
                      onChange={e => { setTargetCityId(e.target.value); setSelectedEventId(''); setDescription(''); }}
                      required
                      className="w-full rounded-xl border border-edge text-sm px-3 py-2.5 bg-surface-card text-content-primary focus:border-brand-500 focus:outline-none"
                    >
                      <option value="">— Город цели —</option>
                      {targetCitiesForAdmin.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  )}
                </>
              )}

              {/* Visual direction */}
              {sourceCityName && targetCityName && (
                <div className="flex items-center gap-2 px-3 py-2 bg-surface-card rounded-lg border border-edge text-xs">
                  <MapPin size={11} className="text-content-muted" />
                  <span className="font-medium text-content-primary">{sourceCityName}</span>
                  <ArrowRight size={12} className="text-sky-400" />
                  <span className="font-semibold text-sky-500">{targetCityName}</span>
                  <span className="text-content-muted ml-1">· баланс снимается с {sourceCityName}</span>
                </div>
              )}
            </div>
          )}

          {/* Source balance */}
          {(cityId || user.role === 'CITY') && (
            <div className="p-3 rounded-xl bg-surface-secondary border border-edge">
              <p className="text-xs text-content-muted mb-2 font-medium">
                {loadingBalance ? 'Загружаю баланс...' : `Баланс ${sourceCityName || 'города'}:`}
              </p>
              {!loadingBalance && cityBalance && (
                <BraceletDots black={cityBalance.black} white={cityBalance.white} red={cityBalance.red} blue={cityBalance.blue} />
              )}
              {!loadingBalance && !cityBalance && (
                <p className="text-xs text-content-muted italic">Нет данных</p>
              )}
            </div>
          )}

          {/* Event selector */}
          {(expenseType === 'INTERNAL' || targetCityId) && (() => {
            const eventsForCity = getEventsForCity();
            return (
              <div>
                <label className="block text-xs font-semibold text-content-muted uppercase tracking-wide mb-2">
                  Мероприятие
                  <span className="normal-case font-normal ml-1 text-content-muted">(необязательно)</span>
                </label>
                {loadingEvents ? (
                  <div className="text-xs text-content-muted py-2">Загружаю...</div>
                ) : eventsForCity.length > 0 ? (
                  <select
                    value={selectedEventId}
                    onChange={e => {
                      const id = e.target.value;
                      setSelectedEventId(id);
                      if (id) {
                        const ev = eventsForCity.find(ev => String(ev.id) === id);
                        if (ev) setDescription(ev.title);
                      } else {
                        setDescription('');
                      }
                    }}
                    className="w-full rounded-xl border border-edge text-sm px-3 py-2.5 bg-surface-card text-content-primary focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
                  >
                    <option value="">— Выбрать мероприятие —</option>
                    {eventsForCity.map(ev => (
                      <option key={ev.id} value={String(ev.id)}>
                        {ev.date ? `${new Date(ev.date).toLocaleDateString('ru-RU', {day:'2-digit',month:'short'})} · ` : ''}
                        {ev.title}
                        {ev.city ? ` (${ev.city})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-[11px] text-content-muted bg-surface-secondary rounded-lg px-3 py-2">
                    Нет мероприятий для этого города — заполните описание вручную ↓
                  </p>
                )}
              </div>
            );
          })()}

          {/* Description */}
          {!selectedEventId && (
            <Input
              label="Описание расхода *"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={expenseType === 'EXTERNAL' ? 'Для чего передаём браслеты...' : 'Промо-акция, подготовка склада...'}
              required
            />
          )}

          {/* Date */}
          <div>
            <label className="block text-xs font-semibold text-content-muted uppercase tracking-wide mb-1.5">
              Дата <span className="normal-case font-normal">(необязательно)</span>
            </label>
            <input
              type="date"
              value={eventDate}
              onChange={e => setEventDate(e.target.value)}
              className="w-full rounded-xl border border-edge text-sm px-3 py-2.5 bg-surface-card text-content-primary focus:border-brand-500 focus:outline-none"
            />
          </div>

          {/* Bracelet quantities */}
          <div>
            <p className="text-xs font-semibold text-content-muted uppercase tracking-wide mb-2">Количество браслетов</p>
            <div className="grid grid-cols-2 gap-3">
              {BRACELET_KEYS.map(key => {
                const available = cityBalance?.[key] ?? null;
                const entered = parseInt(quantities[key]) || 0;
                const over = available !== null && entered > available;
                return (
                  <div key={key}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`w-3 h-3 rounded-full flex-shrink-0 ${BRACELET_COLORS[key]}`} />
                      <span className="text-xs font-medium text-content-secondary">{ITEM_LABELS[key.toUpperCase()]}</span>
                      {available !== null && (
                        <span className="text-[10px] text-content-muted ml-auto">ост. {available}</span>
                      )}
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={quantities[key]}
                      onChange={e => setQuantities(p => ({ ...p, [key]: e.target.value }))}
                      placeholder="0"
                      className={`w-full rounded-xl border text-sm px-3 py-2 bg-surface-card text-content-primary focus:ring-2 focus:outline-none ${
                        over
                          ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                          : 'border-edge focus:border-brand-500 focus:ring-brand-500/20'
                      }`}
                    />
                    {over && <p className="text-[10px] text-red-400 mt-0.5">Превышает остаток</p>}
                  </div>
                );
              })}
            </div>
          </div>

          <Input
            label="Примечание"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Необязательный комментарий"
          />

          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 text-red-400 text-sm px-3 py-2.5 rounded-xl">
              <AlertCircle size={15} /> {error}
            </div>
          )}

          <Button type="submit" loading={sending} disabled={sending} className="w-full">
            <TrendingDown size={16} /> Записать расход
          </Button>
        </form>
      </Modal>
    </div>
  );
}
