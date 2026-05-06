import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useFilterStore } from '../store/useAppStore';
import { inventoryApi } from '../api/inventory';
import { usersApi } from '../api/users';
import { eventsApi } from '../api/events';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import { BraceletRow } from '../components/ui/BraceletBadge';
import {
  CalendarDays, Plus, Search, TrendingDown,
  MapPin, BarChart3, Trash2, ArrowLeftRight, Home, Globe,
} from 'lucide-react';

const ITEM_LABELS = { BLACK: 'Чёрные', WHITE: 'Белые', RED: 'Красные', BLUE: 'Синие' };
const BRACELET_KEYS = ['black', 'white', 'red', 'blue'];

const EXPENSE_TYPE_META = {
  INTERNAL: { label: 'Внутренний', className: 'bg-emerald-500/10 text-emerald-500', Icon: Home },
  EXTERNAL: { label: 'Внешний', className: 'bg-sky-500/10 text-sky-500', Icon: ArrowLeftRight },
  THIRD:    { label: 'Сторонний', className: 'bg-gray-500/10 text-gray-400', Icon: Globe },
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
  const [imprezaEvents, setimprezaEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState('');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCity, setFilterCity] = useState('all');
  const [filterType, setFilterType] = useState('all'); // all | INTERNAL | EXTERNAL | THIRD
  const [sortOrder, setSortOrder] = useState('newest');

  // Form
  const [cityId, setCityId] = useState('');
  const [expenseType, setExpenseType] = useState('EXTERNAL'); // EXTERNAL | INTERNAL | THIRD
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [location, setLocation] = useState('');
  const [quantities, setQuantities] = useState({ black: '', white: '', red: '', blue: '' });
  const [notes, setNotes] = useState('');

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
      if (globalCityId) params.cityId = globalCityId;
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

  // Load IMPREZA events filtered by user's city (for CITY role)
  const loadimprezaEvents = async (targetCityName) => {
    try {
      const params = {};
      // If we know the city name, filter on server side
      if (targetCityName) params.city = targetCityName;
      const { data } = await eventsApi.getEvents(params);
      const list = data?.data || data;
      const allEvents = Array.isArray(list) ? list : [];
      
      // Filter out old events (only show last 60 days)
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      
      const recentEvents = allEvents.filter(ev => {
        // Keep events without date or with recent date
        if (!ev.date) return true;
        const eventDate = new Date(ev.date);
        return !isNaN(eventDate.getTime()) && eventDate >= sixtyDaysAgo;
      });
      
      setimprezaEvents(recentEvents);
    } catch (err) {
      console.error('Failed to load IMPREZA events', err);
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
      THIRD: expenses.filter((ex) => ex.type === 'THIRD').length,
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
    setSelectedEvent('');
    setSelectedCountryId('');
    setimprezaEvents([]);
    setExpenseType('EXTERNAL');
    setCityBalance(null);

    if (user.role === 'CITY') {
      setCityId(user.cityId);
      await loadCityBalance(user.cityId);
      const cityName = user.city?.name;
      if (cityName) {
        await loadimprezaEvents(cityName);
      } else {
        await loadimprezaEvents();
      }
    } else if (user.role === 'ADMIN' || user.role === 'OFFICE') {
      await loadimprezaEvents();
    } else if (user.role === 'COUNTRY') {
      await loadimprezaEvents();
    }
  };

  // When country is selected, reload cities filtered by that country
  const handleCountryChange = async (e) => {
    const cid = e.target.value;
    setSelectedCountryId(cid);
    setCityId('');
    setSelectedEvent('');
    setEventName('');
    setEventDate('');
    setLocation('');
    setimprezaEvents([]);
    if (cid) {
      await loadCities(cid);
    } else {
      await loadCities();
    }
  };

  // When city is selected in the form (for ADMIN/OFFICE/COUNTRY), load events for that city
  const handleCityChange = async (e) => {
    const id = e.target.value;
    setCityId(id);
    setSelectedEvent('');
    setEventName('');
    setEventDate('');
    setLocation('');
    await loadCityBalance(id);

    if (id) {
      const city = cities.find((c) => c.id === id);
      if (city?.name) {
        await loadimprezaEvents(city.name);
      } else {
        await loadimprezaEvents();
      }
    } else {
      setimprezaEvents([]);
    }
  };

  const handleEventSelect = (e) => {
    const val = e.target.value;
    setSelectedEvent(val);
    if (val) {
      const ev = imprezaEvents.find((ev) => String(ev.id) === val);
      if (ev) {
        setEventName(ev.title);
        setEventDate(ev.date && !isNaN(new Date(ev.date).getTime()) ? ev.date.slice(0, 10) : '');
        setLocation(ev.venue || ev.city || '');
      }
    } else {
      setEventName('');
      setEventDate('');
      setLocation('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const targetCityId = user.role === 'CITY' ? user.cityId : cityId;
    if (!targetCityId) { setError('Выберите город'); return; }

    // Validate eventName based on type
    if (expenseType === 'EXTERNAL' && !selectedEvent) {
      setError('Выберите мероприятие IMPREZA из списка');
      return;
    }
    if ((expenseType === 'INTERNAL' || expenseType === 'THIRD') && !eventName.trim()) {
      setError(expenseType === 'INTERNAL' ? 'Укажите описание расхода' : 'Укажите название мероприятия');
      return;
    }

    const black = parseInt(quantities.black) || 0;
    const white = parseInt(quantities.white) || 0;
    const red = parseInt(quantities.red) || 0;
    const blue = parseInt(quantities.blue) || 0;

    if (black + white + red + blue === 0) {
      setError('Укажите количество браслетов');
      return;
    }

    // Balance warning check
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
        cityId: targetCityId,
        eventName: eventName.trim(),
        eventDate: eventDate || undefined,
        location: location.trim() || undefined,
        type: expenseType,
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
    setExpenseType('EXTERNAL');
    setEventName('');
    setEventDate('');
    setLocation('');
    setQuantities({ black: '', white: '', red: '', blue: '' });
    setNotes('');
    setError('');
    setSelectedEvent('');
    setimprezaEvents([]);
    setCityBalance(null);
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
          ...(stats.byType.THIRD > 0 ? [{ key: 'THIRD', label: 'Сторонние', count: stats.byType.THIRD }] : []),
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
                      {ex.type === 'EXTERNAL' && ex.targetCityId && (
                        <span className="text-sky-400 text-[11px]">→ Внешний</span>
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
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'EXTERNAL', icon: ArrowLeftRight, label: 'Внешний',     desc: 'Мероприятие IMPREZA',  active: 'border-sky-500 bg-sky-500/10 text-sky-500', inactive: 'border-edge text-content-secondary' },
                { key: 'INTERNAL', icon: Home,           label: 'Внутренний',  desc: 'Склад, промо, штаб',   active: 'border-emerald-500 bg-emerald-500/10 text-emerald-500', inactive: 'border-edge text-content-secondary' },
                { key: 'THIRD',    icon: Globe,          label: 'Сторонний',   desc: 'Внешняя организация',  active: 'border-amber-500 bg-amber-500/10 text-amber-500', inactive: 'border-edge text-content-secondary' },
              ].map(({ key, icon: Icon, label, desc, active, inactive }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setExpenseType(key);
                    setSelectedEvent('');
                    setEventName('');
                    setEventDate('');
                    setLocation('');
                  }}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-center transition-all ${expenseType === key ? active : inactive + ' hover:border-brand-500/30'}`}
                >
                  <Icon size={18} />
                  <span className="text-xs font-semibold">{label}</span>
                  <span className={`text-[10px] leading-tight ${expenseType === key ? 'opacity-80' : 'text-content-muted'}`}>{desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Country select ────────────────────────── */}
          {user.role !== 'CITY' && countries.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-content-primary mb-1">Страна</label>
              <select
                value={selectedCountryId}
                onChange={handleCountryChange}
                className="w-full rounded-[var(--radius-sm)] border border-edge text-sm px-3 py-2 bg-surface-card text-content-primary focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
              >
                <option value="">— Выберите страну —</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* ── City select ───────────────────────────── */}
          {user.role !== 'CITY' && cities.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-content-primary mb-1">Город</label>
              <select
                value={cityId}
                onChange={handleCityChange}
                className="w-full rounded-[var(--radius-sm)] border border-edge text-sm px-3 py-2 bg-surface-card text-content-primary focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
                required
              >
                <option value="">— Выберите город —</option>
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* ── City balance display ──────────────────── */}
          {(cityId || user.role === 'CITY') && (
            <div className="p-3 rounded-lg bg-surface-secondary border border-edge">
              <p className="text-xs text-content-muted mb-2">
                {loadingBalance ? 'Загружаю баланс города...' : 'Доступный баланс города:'}
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

          {/* ── Event / description section ───────────── */}
          {expenseType === 'EXTERNAL' ? (
            <div>
              <label className="block text-sm font-medium text-content-primary mb-1">
                Мероприятие IMPREZA <span className="text-red-400">*</span>
              </label>
              {imprezaEvents.length > 0 ? (
                <select
                  value={selectedEvent}
                  onChange={handleEventSelect}
                  className="w-full rounded-[var(--radius-sm)] border border-edge text-sm px-3 py-2 bg-surface-card text-content-primary focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
                >
                  <option value="">— Выберите мероприятие —</option>
                  {imprezaEvents.map((ev) => (
                    <option key={ev.id} value={String(ev.id)}>
                      {ev.title}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-sm text-content-muted bg-surface-secondary px-3 py-2.5 rounded-[var(--radius-sm)]">
                  {(cityId || user.role === 'CITY')
                    ? 'Нет мероприятий IMPREZA для этого города'
                    : 'Выберите город для загрузки мероприятий'}
                </div>
              )}
              {selectedEvent && eventName && (
                <div className="mt-2 bg-sky-500/10 text-sky-400 rounded-[var(--radius-sm)] px-3 py-2 text-sm space-y-0.5">
                  <div className="font-medium">{eventName}</div>
                  {eventDate && !isNaN(new Date(eventDate).getTime()) && (
                    <div className="text-xs flex items-center gap-1 opacity-80">
                      <CalendarDays size={12} />
                      {new Date(eventDate).toLocaleDateString('ru-RU')}
                    </div>
                  )}
                  {location && (
                    <div className="text-xs flex items-center gap-1 opacity-80">
                      <MapPin size={12} />
                      {location}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : expenseType === 'INTERNAL' ? (
            <Input
              label="Описание расхода *"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder="Напр: Подготовка склада, Промо-акция, Тестирование..."
              required
            />
          ) : (
            /* THIRD */
            <Input
              label="Название события *"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder="Название мероприятия сторонней организации"
              required
            />
          )}

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
