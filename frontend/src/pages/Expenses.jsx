import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useFilterStore } from '../store/useAppStore';
import { inventoryApi } from '../api/inventory';
import { usersApi } from '../api/users';
import { accessApi } from '../api/access';
import { eventsApi } from '../api/events';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import { BraceletRow } from '../components/ui/BraceletBadge';
import {
  CalendarDays, Plus, Search, TrendingDown,
  MapPin, BarChart3, Trash2, ArrowLeftRight, Home, Globe, ExternalLink,
} from 'lucide-react';

const ITEM_LABELS = { BLACK: 'Чёрные', WHITE: 'Белые', RED: 'Красные', BLUE: 'Синие' };
const BRACELET_KEYS = ['black', 'white', 'red', 'blue'];

const EXPENSE_TYPE_META = {
  INTERNAL: { label: 'Внутренний', className: 'bg-emerald-500/10 text-emerald-500', Icon: Home },
  EXTERNAL: { label: 'Внешний',   className: 'bg-sky-500/10 text-sky-500',     Icon: ExternalLink },
  THIRD:    { label: 'Сторонний', className: 'bg-gray-500/10 text-gray-400',   Icon: Globe },
};

const ROLE_LABELS = { ADMIN: 'Админ', OFFICE: 'Офис', COUNTRY: 'Страна', CITY: 'Город' };

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

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCity, setFilterCity] = useState('all');
  const [filterType, setFilterType] = useState('all'); // all | INTERNAL | EXTERNAL | THIRD
  const [sortOrder, setSortOrder] = useState('newest');

  // Form
  const [cityId, setCityId] = useState('');
  const [expenseType, setExpenseType] = useState('INTERNAL'); // INTERNAL | EXTERNAL
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [quantities, setQuantities] = useState({ black: '', white: '', red: '', blue: '' });
  const [notes, setNotes] = useState('');
  // EXTERNAL target
  const [targetCityId, setTargetCityId] = useState('');
  const [targetCountryId, setTargetCountryId] = useState('');
  const [targetCitiesForAdmin, setTargetCitiesForAdmin] = useState([]);
  const [accessibleCities, setAccessibleCities] = useState([]); // for CITY role EXTERNAL

  // Events
  const [imprezaEvents, setImprezaEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [loadingEvents, setLoadingEvents] = useState(false);

  // Balance display in modal
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
      const params = { limit: 100 };
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
    if (user.role === 'ADMIN' || user.role === 'OFFICE' || user.role === 'COUNTRY') {
      try {
        const { data } = await usersApi.getCountries();
        const list = data?.data || data;
        setCountries(Array.isArray(list) ? list : []);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const loadCities = async (countryIdParam) => {
    if (user.role === 'ADMIN' || user.role === 'OFFICE' || user.role === 'COUNTRY') {
      try {
        const cid = user.role === 'COUNTRY' ? user.countryId : countryIdParam;
        const { data } = await usersApi.getCities(cid);
        const list = data?.data || data;
        setCities(Array.isArray(list) ? list : []);
      } catch (err) {
        console.error(err);
      }
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
    } catch (err) {
      console.error('Failed to load city balance', err);
      setCityBalance(null);
    } finally {
      setLoadingBalance(false);
    }
  };

  const loadEvents = async () => {
    setLoadingEvents(true);
    try {
      const { data } = await eventsApi.getEvents({ active: false });
      const list = Array.isArray(data) ? data : (data?.data || []);
      setImprezaEvents(Array.isArray(list) ? list : []);
    } catch {
      setImprezaEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  };

  // Load cities accessible to CITY-role user (for EXTERNAL expenses)
  const loadAccessibleCities = async () => {
    try {
      const { data } = await accessApi.listForUser(user.id);
      const list = data?.accesses ?? data?.data?.accesses ?? data ?? [];
      const accesses = Array.isArray(list) ? list : [];
      const cities = accesses
        .filter(a => !a.revokedAt && !(a.expiresAt && new Date(a.expiresAt) < new Date()))
        .filter(a => a.scopeType === 'CITY')
        .map(a => ({ id: a.scopeId, name: a.target?.name || a.scopeId }));
      setAccessibleCities(cities);
    } catch {
      setAccessibleCities([]);
    }
  };

  // ── Computed stats ─────────────────────────────
  const stats = useMemo(() => {
    const totalEvents = expenses.length;
    let totalBracelets = 0;
    const byColor = { BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 };

    expenses.forEach((ex) => {
      const b = (ex.black || 0) + (ex.white || 0) + (ex.red || 0) + (ex.blue || 0);
      totalBracelets += b;
      byColor.BLACK += ex.black || 0;
      byColor.WHITE += ex.white || 0;
      byColor.RED += ex.red || 0;
      byColor.BLUE += ex.blue || 0;
    });

    const avg = totalEvents > 0 ? Math.round(totalBracelets / totalEvents) : 0;

    const byType = {
      INTERNAL: expenses.filter((ex) => (ex.type || 'INTERNAL') === 'INTERNAL').length,
      EXTERNAL: expenses.filter((ex) => ex.type === 'EXTERNAL').length,
      THIRD:    expenses.filter((ex) => ex.type === 'THIRD').length,
    };

    return { totalEvents, totalBracelets, avg, byColor, byType };
  }, [expenses]);

  // ── Filtered & sorted expenses ─────────────────
  const filteredExpenses = useMemo(() => {
    let list = [...expenses];
    if (filterType !== 'all') {
      list = list.filter((ex) => (ex.type || 'INTERNAL') === filterType);
    }
    if (filterCity !== 'all') {
      list = list.filter((ex) => ex.city?.name === filterCity || ex.cityId === filterCity);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((ex) =>
        (ex.eventName || '').toLowerCase().includes(q) ||
        (ex.location || '').toLowerCase().includes(q) ||
        (ex.city?.name || '').toLowerCase().includes(q),
      );
    }

    list.sort((a, b) => {
      if (sortOrder === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
      if (sortOrder === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
      const at = (a.black || 0) + (a.white || 0) + (a.red || 0) + (a.blue || 0);
      const bt = (b.black || 0) + (b.white || 0) + (b.red || 0) + (b.blue || 0);
      return sortOrder === 'most' ? bt - at : at - bt;
    });

    return list;
  }, [expenses, filterCity, searchQuery, sortOrder]);

  // Available city names for filter
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

  // When source country changes (ADMIN/OFFICE)
  const handleCountryChange = async (e) => {
    const cid = e.target.value;
    setSelectedCountryId(cid);
    setCityId('');
    setCityBalance(null);
    if (cid) await loadCities(cid);
    else await loadCities();
  };

  // When source city changes (ADMIN/OFFICE/COUNTRY)
  const handleCityChange = async (e) => {
    const id = e.target.value;
    setCityId(id);
    await loadCityBalance(id);
  };

  // When target country changes for ADMIN EXTERNAL
  const handleTargetCountryChange = async (e) => {
    const cid = e.target.value;
    setTargetCountryId(cid);
    setTargetCityId('');
    if (!cid) { setTargetCitiesForAdmin([]); return; }
    try {
      const { data } = await usersApi.getCities(cid);
      const list = data?.data || data;
      setTargetCitiesForAdmin(Array.isArray(list) ? list : []);
    } catch {
      setTargetCitiesForAdmin([]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Source city (where balance is deducted)
    const sourceCityId = user.role === 'CITY' ? user.cityId : cityId;
    if (!sourceCityId) { setError('Выберите город'); return; }

    if (!description.trim()) {
      setError('Укажите описание расхода');
      return;
    }

    if (expenseType === 'EXTERNAL') {
      if (!targetCityId) { setError('Выберите целевой город'); return; }
      if (targetCityId === sourceCityId) { setError('Целевой город не может совпадать с текущим'); return; }
    }

    const black = parseInt(quantities.black) || 0;
    const white = parseInt(quantities.white) || 0;
    const red = parseInt(quantities.red) || 0;
    const blue = parseInt(quantities.blue) || 0;

    if (black + white + red + blue === 0) {
      setError('Укажите количество браслетов');
      return;
    }

    // Balance warning check (balance is always on source city)
    if (cityBalance) {
      const overBlack = black > (cityBalance.black || 0);
      const overWhite = white > (cityBalance.white || 0);
      const overRed   = red   > (cityBalance.red   || 0);
      const overBlue  = blue  > (cityBalance.blue  || 0);
      if (overBlack || overWhite || overRed || overBlue) {
        const over = [];
        if (overBlack) over.push(`чёрных (есть: ${cityBalance.black})`);
        if (overWhite) over.push(`белых (есть: ${cityBalance.white})`);
        if (overRed)   over.push(`красных (есть: ${cityBalance.red})`);
        if (overBlue)  over.push(`синих (есть: ${cityBalance.blue})`);
        setError(`Недостаточно браслетов: ${over.join(', ')}`);
        return;
      }
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
    if (!confirm('Удалить этот расход? Остатки будут восстановлены.')) return;
    try {
      await inventoryApi.deleteExpense(id);
      await loadExpenses();
    } catch (err) {
      alert(err.response?.data?.message || 'Ошибка удаления');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-brand-200 border-t-brand-600 rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Header ────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-content-primary flex items-center gap-2"><CalendarDays size={22} className="text-brand-500" /> Расходы</h2>
          <p className="text-xs text-content-muted mt-0.5">Учёт расхода браслетов по событиям IMPREZA</p>
        </div>
        {['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'].includes(user.role) && (
          <Button onClick={openCreate} size="sm">
            <Plus size={18} /> Новое
          </Button>
        )}
      </div>

      {/* ── Statistics Cards ──────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-surface-card rounded-[var(--radius-md)] border border-edge p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center">
              <CalendarDays size={18} className="text-purple-500" />
            </div>
            <div>
              <div className="text-2xl font-bold text-content-primary">{stats.totalEvents}</div>
              <div className="text-xs text-content-muted">Расходов</div>
            </div>
          </div>
        </div>
        <div className="bg-surface-card rounded-[var(--radius-md)] border border-edge p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-red-500/10 flex items-center justify-center">
              <TrendingDown size={18} className="text-red-500" />
            </div>
            <div>
              <div className="text-2xl font-bold text-content-primary">{stats.totalBracelets}</div>
              <div className="text-xs text-content-muted">Израсходовано</div>
            </div>
          </div>
        </div>
        <div className="bg-surface-card rounded-[var(--radius-md)] border border-edge p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
              <BarChart3 size={18} className="text-blue-500" />
            </div>
            <div>
              <div className="text-2xl font-bold text-content-primary">{stats.avg}</div>
              <div className="text-xs text-content-muted">Среднее</div>
            </div>
          </div>
        </div>
        <div className="bg-surface-card rounded-[var(--radius-md)] border border-edge p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
              <MapPin size={18} className="text-amber-500" />
            </div>
            <div>
              <div className="text-2xl font-bold text-content-primary">{cityNames.length}</div>
              <div className="text-xs text-content-muted">Городов</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Color breakdown bar ───────────────────────── */}
      {stats.totalBracelets > 0 && (
        <div className="bg-surface-card rounded-[var(--radius-md)] border border-edge p-4">
          <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
            {[
              { key: 'BLACK', color: 'bg-gray-900 dark:bg-gray-300', val: stats.byColor.BLACK },
              { key: 'WHITE', color: 'bg-gray-300 dark:bg-gray-500', val: stats.byColor.WHITE },
              { key: 'RED', color: 'bg-red-500', val: stats.byColor.RED },
              { key: 'BLUE', color: 'bg-blue-500', val: stats.byColor.BLUE },
            ].filter((c) => c.val > 0).map((c) => (
              <div
                key={c.key}
                className={`${c.color} transition-all rounded-full`}
                style={{ width: `${(c.val / stats.totalBracelets) * 100}%` }}
                title={`${ITEM_LABELS[c.key]}: ${c.val}`}
              />
            ))}
          </div>
          <div className="flex justify-between mt-2 text-[11px] text-content-secondary">
            {[
              { key: 'BLACK', dot: 'bg-gray-900 dark:bg-gray-300' },
              { key: 'WHITE', dot: 'bg-gray-300 dark:bg-gray-500' },
              { key: 'RED', dot: 'bg-red-500' },
              { key: 'BLUE', dot: 'bg-blue-500' },
            ].map((c) => (
              <span key={c.key} className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                {ITEM_LABELS[c.key]}: {stats.byColor[c.key]}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Type tabs ─────────────────────────────────── */}
      <div className="flex items-center gap-1 bg-surface-card border border-edge rounded-[var(--radius-sm)] p-0.5 w-fit">
        {[
          { key: 'all', label: 'Все', count: stats.totalEvents },
          { key: 'INTERNAL', label: 'Внутренние', count: stats.byType.INTERNAL },
          { key: 'EXTERNAL', label: 'Внешние', count: stats.byType.EXTERNAL },
          ...(stats.byType.THIRD > 0 ? [{ key: 'THIRD', label: 'Сторонние (устар.)', count: stats.byType.THIRD }] : []),
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setFilterType(t.key)}
            className={`px-3 py-1.5 text-sm font-medium rounded-[var(--radius-sm)] transition-colors flex items-center gap-1.5 ${
              filterType === t.key ? 'bg-brand-600 text-white' : 'text-content-secondary hover:text-content-primary'
            }`}
          >
            {t.label}
            <span className={`text-xs px-1.5 rounded-full ${filterType === t.key ? 'bg-white/20' : 'bg-surface-secondary'}`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Filters ───────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
          <input
            type="text"
            placeholder="Поиск по названию, месту, городу..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-[var(--radius-sm)] border border-edge bg-surface-card text-content-primary text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
          />
        </div>
        <div className="flex gap-2">
          {cityNames.length > 1 && (
            <select
              value={filterCity}
              onChange={(e) => setFilterCity(e.target.value)}
              className="rounded-[var(--radius-sm)] border border-edge text-sm px-3 py-2 bg-surface-card text-content-primary focus:border-brand-500 focus:outline-none"
            >
              <option value="all">Все города</option>
              {cityNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          )}
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="rounded-[var(--radius-sm)] border border-edge text-sm px-3 py-2 bg-surface-card text-content-primary focus:border-brand-500 focus:outline-none"
          >
            <option value="newest">Новые ↓</option>
            <option value="oldest">Старые ↑</option>
            <option value="most">Больше шт</option>
            <option value="least">Меньше шт</option>
          </select>
        </div>
      </div>

      {/* ── Expenses List ─────────────────────────────── */}
      {filteredExpenses.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500 text-center py-6">
            {expenses.length === 0 ? 'Нет расходов' : 'Ничего не найдено'}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredExpenses.map((ex) => {
            const total = (ex.black || 0) + (ex.white || 0) + (ex.red || 0) + (ex.blue || 0);
            const typeMeta = EXPENSE_TYPE_META[ex.type] ?? EXPENSE_TYPE_META.INTERNAL;
            const TypeIcon = typeMeta.Icon;
            const actor = ex.actorUser;
            return (
              <div
                key={ex.id}
                className="bg-surface-card rounded-[var(--radius-md)] border border-edge hover:shadow-md transition-shadow overflow-hidden"
              >
                <div className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-content-primary flex items-center gap-2">
                        <CalendarDays size={16} className="text-purple-500 flex-shrink-0" />
                        <span className="truncate">{ex.eventName}</span>
                        <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${typeMeta.className}`}>
                          <TypeIcon size={10} />{typeMeta.label}
                        </span>
                      </h3>
                      {ex.location && ex.location.toLowerCase() !== (ex.city?.name || '').toLowerCase() && (
                        <div className="text-xs text-content-muted mt-0.5 flex items-center gap-1 ml-6">
                          <MapPin size={11} />
                          {ex.location}
                        </div>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs text-content-muted">
                        {ex.eventDate && !isNaN(new Date(ex.eventDate).getTime())
                          ? new Date(ex.eventDate).toLocaleDateString('ru-RU')
                          : new Date(ex.createdAt).toLocaleDateString('ru-RU')}
                      </div>
                      <div className="text-sm font-bold text-red-500 flex items-center gap-1 justify-end mt-0.5">
                        <TrendingDown size={13} />
                        {total} шт
                      </div>
                    </div>
                  </div>

                  <BraceletRow
                    items={{ BLACK: ex.black, WHITE: ex.white, RED: ex.red, BLUE: ex.blue }}
                    size="sm"
                  />

                  <div className="flex items-center justify-between text-xs text-content-muted">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="flex items-center gap-1">
                        <MapPin size={11} />
                        {ex.city?.name || 'Город'}
                      </span>
                      {actor && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 font-medium">
                          Добавил: {actor.displayName || actor.username}
                          {actor.role && (
                            <span className="text-[10px] opacity-70">({ROLE_LABELS[actor.role] || actor.role})</span>
                          )}
                        </span>
                      )}
                      {ex.type === 'EXTERNAL' && (
                        <span className="text-sky-400 text-[11px] flex items-center gap-1">
                          <ExternalLink size={10} />
                          {ex.city?.name} → {ex.targetCity?.name || (ex.targetCityId ? '...' : '?')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {ex.notes && (
                        <span className="truncate max-w-[200px] italic">{ex.notes}</span>
                      )}
                      {(user.role === 'ADMIN' || user.role === 'OFFICE') && (
                        <button
                          onClick={() => handleDelete(ex.id)}
                          className="p-1 rounded hover:bg-red-500/10 text-content-muted hover:text-red-500 transition-colors"
                          title="Удалить"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Summary Footer ────────────────────────────── */}
      {filteredExpenses.length > 0 && (
        <div className="flex items-center justify-between bg-surface-card rounded-[var(--radius-md)] px-4 py-3 border border-edge">
          <span className="text-xs text-gray-500">
            Показано {filteredExpenses.length} из {expenses.length} расходов
          </span>
          <span className="text-sm font-semibold text-content-primary">
            Итого: {filteredExpenses.reduce(
              (s, ex) => s + (ex.black || 0) + (ex.white || 0) + (ex.red || 0) + (ex.blue || 0),
              0,
            )} браслетов
          </span>
        </div>
      )}

      {/* ── Success toast ─────────────────────────────── */}
      {successMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white text-sm px-5 py-2.5 rounded-full shadow-lg animate-fadeIn pointer-events-none">
          ✓ {successMsg}
        </div>
      )}

      {/* ── Create Expense Modal ──────────────────────── */}
      <Modal
        open={showCreate}
        onClose={() => { setShowCreate(false); resetForm(); }}
        title="Новый расход"
      >
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* ── Expense type selector ─────────────────── */}
          <div>
            <p className="text-sm font-medium text-content-primary mb-2">Тип расхода</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'INTERNAL', icon: Home,         label: 'Внутренний', desc: 'Расход текущего города — склад, промо, штаб',              active: 'border-emerald-500 bg-emerald-500/10 text-emerald-500', inactive: 'border-edge text-content-secondary' },
                { key: 'EXTERNAL', icon: ExternalLink, label: 'Внешний',    desc: 'Расход для другого города (баланс снимается здесь)',       active: 'border-sky-500 bg-sky-500/10 text-sky-500',             inactive: 'border-edge text-content-secondary' },
              ].map(({ key, icon: Icon, label, desc, active, inactive }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setExpenseType(key); setTargetCityId(''); setTargetCountryId(''); setTargetCitiesForAdmin([]); }}
                  className={`flex items-start gap-2.5 p-3 rounded-xl border-2 text-left transition-all ${expenseType === key ? active : inactive + ' hover:border-brand-500/30'}`}
                >
                  <div className="mt-0.5 flex-shrink-0"><Icon size={16} /></div>
                  <div>
                    <div className="text-xs font-semibold">{label}</div>
                    <div className={`text-[10px] leading-tight mt-0.5 ${expenseType === key ? 'opacity-80' : 'text-content-muted'}`}>{desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ── Source city ───────────────────────────── */}
          {user.role === 'CITY' ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-surface-secondary rounded-lg border border-edge text-sm">
              <MapPin size={14} className="text-content-muted flex-shrink-0" />
              <span className="text-content-muted">Текущий город (источник):</span>
              <span className="font-semibold text-content-primary">{user.city?.name || 'Ваш город'}</span>
            </div>
          ) : (
            <>
              {countries.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-content-primary mb-1">Страна (источник)</label>
                  <select
                    value={selectedCountryId}
                    onChange={handleCountryChange}
                    className="w-full rounded-[var(--radius-sm)] border border-edge text-sm px-3 py-2 bg-surface-card text-content-primary focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
                  >
                    <option value="">— Выберите страну —</option>
                    {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              {cities.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-content-primary mb-1">Город (источник — откуда снимается баланс)</label>
                  <select
                    value={cityId}
                    onChange={handleCityChange}
                    className="w-full rounded-[var(--radius-sm)] border border-edge text-sm px-3 py-2 bg-surface-card text-content-primary focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
                    required
                  >
                    <option value="">— Выберите город —</option>
                    {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
            </>
          )}

          {/* ── Target city (EXTERNAL only) ───────────── */}
          {expenseType === 'EXTERNAL' && (
            <div className="border border-sky-500/30 bg-sky-500/5 rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-sky-500 flex items-center gap-1.5">
                <ExternalLink size={13} /> Целевой город (для кого расход)
              </p>

              {user.role === 'CITY' ? (
                accessibleCities.length > 0 ? (
                  <select
                    value={targetCityId}
                    onChange={(e) => setTargetCityId(e.target.value)}
                    className="w-full rounded-[var(--radius-sm)] border border-edge text-sm px-3 py-2 bg-surface-card text-content-primary focus:border-brand-500 focus:outline-none"
                    required
                  >
                    <option value="">— Выберите город —</option>
                    {accessibleCities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                ) : (
                  <p className="text-xs text-amber-400 px-1">У вас нет доступа к другим городам. Обратитесь к администратору.</p>
                )
              ) : (
                <>
                  <select
                    value={targetCountryId}
                    onChange={handleTargetCountryChange}
                    className="w-full rounded-[var(--radius-sm)] border border-edge text-sm px-3 py-2 bg-surface-card text-content-primary focus:border-brand-500 focus:outline-none"
                  >
                    <option value="">1. Выберите страну цели →</option>
                    {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {targetCountryId && (
                    <select
                      value={targetCityId}
                      onChange={(e) => setTargetCityId(e.target.value)}
                      className="w-full rounded-[var(--radius-sm)] border border-edge text-sm px-3 py-2 bg-surface-card text-content-primary focus:border-brand-500 focus:outline-none"
                      required
                    >
                      <option value="">2. Выберите город цели →</option>
                      {targetCitiesForAdmin.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  )}
                </>
              )}

              {targetCityId && (
                <p className="text-[11px] text-sky-400">
                  Баланс снимается с текущего города и фиксируется как внешний расход в обоих городах
                </p>
              )}
            </div>
          )}

          {/* ── Source city balance ───────────────────── */}
          {(cityId || user.role === 'CITY') && (
            <div className="p-3 rounded-lg bg-surface-secondary border border-edge">
              <p className="text-xs text-content-muted mb-2">
                {loadingBalance ? 'Загружаю баланс...' : 'Баланс текущего города (источника):'}
              </p>
              {!loadingBalance && cityBalance && (
                <BraceletRow
                  items={{ BLACK: cityBalance.black || 0, WHITE: cityBalance.white || 0, RED: cityBalance.red || 0, BLUE: cityBalance.blue || 0 }}
                  size="sm"
                />
              )}
              {!loadingBalance && !cityBalance && (
                <p className="text-xs text-content-muted italic">Нет данных о балансе</p>
              )}
            </div>
          )}

          {/* ── Event selector (both types) ───────────── */}
          <div>
            <label className="block text-sm font-medium text-content-primary mb-1">
              Мероприятие
              <span className="text-content-muted font-normal ml-1">(необязательно)</span>
            </label>
            {loadingEvents ? (
              <div className="text-xs text-content-muted px-1 py-2">Загружаю мероприятия...</div>
            ) : (
              <select
                value={selectedEventId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedEventId(id);
                  if (id) {
                    const ev = imprezaEvents.find((ev) => String(ev.id) === id);
                    if (ev) setDescription(ev.title);
                  } else {
                    setDescription('');
                  }
                }}
                className="w-full rounded-[var(--radius-sm)] border border-edge text-sm px-3 py-2 bg-surface-card text-content-primary focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
              >
                <option value="">— Выбрать мероприятие —</option>
                {imprezaEvents.map((ev) => (
                  <option key={ev.id} value={String(ev.id)}>
                    {ev.date ? `${new Date(ev.date).toLocaleDateString('ru-RU')} · ` : ''}
                    {ev.title}
                    {ev.city ? ` (${ev.city})` : ''}
                  </option>
                ))}
              </select>
            )}
            {imprezaEvents.length === 0 && !loadingEvents && (
              <p className="text-[11px] text-content-muted mt-0.5">
                Мероприятия недоступны — заполните описание вручную
              </p>
            )}
          </div>

          {/* ── Description (only when no event selected) ── */}
          {!selectedEventId && (
          <Input
            label={expenseType === 'EXTERNAL' ? 'Описание расхода *' : 'Описание расхода *'}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={expenseType === 'EXTERNAL'
              ? 'Для чего выдаём браслеты (событие, промо, передача...)'
              : 'Напр: Подготовка склада, Промо-акция, Тестирование...'}
            required
          />
          )}

          {/* ── Optional date ─────────────────────────── */}
          <div>
            <label className="block text-xs font-medium text-content-muted mb-1">Дата (необязательно)</label>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="w-full rounded-[var(--radius-sm)] border border-edge text-sm px-3 py-2 bg-surface-card text-content-primary focus:border-brand-500 focus:outline-none"
            />
          </div>

          {/* ── Bracelet quantities ───────────────────── */}
          <div>
            <p className="text-sm font-medium text-content-primary mb-2">Количество браслетов</p>
            <div className="grid grid-cols-2 gap-3">
              {BRACELET_KEYS.map((key) => {
                const available = cityBalance?.[key] ?? null;
                const entered   = parseInt(quantities[key]) || 0;
                const over      = available !== null && entered > available;
                return (
                  <div key={key}>
                    <Input
                      label={ITEM_LABELS[key.toUpperCase()]}
                      type="number"
                      min="0"
                      value={quantities[key]}
                      onChange={(e) => setQuantities((p) => ({ ...p, [key]: e.target.value }))}
                      placeholder="0"
                      className={over ? 'border-red-500 focus:border-red-500' : ''}
                    />
                    {over && (
                      <p className="text-[11px] text-red-400 mt-0.5">Превышает баланс ({available})</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <Input
            label="Примечание"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Комментарий (необязательно)"
          />

          {error && (
            <div className="bg-red-500/10 text-red-400 text-sm px-3 py-2 rounded-[var(--radius-sm)]">{error}</div>
          )}

          <Button
            type="submit"
            loading={sending}
            disabled={sending}
            className="w-full"
          >
            <TrendingDown size={18} /> Записать расход
          </Button>
        </form>
      </Modal>
    </div>
  );
}
