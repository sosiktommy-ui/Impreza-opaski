import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../store/useAuthStore';
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
  MapPin, BarChart3, Trash2,
} from 'lucide-react';

const ITEM_LABELS = { BLACK: 'Чёрные', WHITE: 'Белые', RED: 'Красные', BLUE: 'Синие' };
const BRACELET_KEYS = ['black', 'white', 'red', 'blue'];

export default function Expenses() {
  const { user } = useAuthStore();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [cities, setCities] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [imprezaEvents, setimprezaEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState('');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCity, setFilterCity] = useState('all');
  const [sortOrder, setSortOrder] = useState('newest');

  // Form
  const [cityId, setCityId] = useState('');
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [location, setLocation] = useState('');
  const [quantities, setQuantities] = useState({ black: '', white: '', red: '', blue: '' });
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadExpenses();
    loadCities();
  }, []);

  const loadExpenses = async () => {
    try {
      const { data } = await inventoryApi.getExpenses({ limit: 100 });
      const list = Array.isArray(data) ? data : (data?.data || []);
      setExpenses(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadCities = async () => {
    if (user.role === 'ADMIN' || user.role === 'OFFICE' || user.role === 'COUNTRY') {
      try {
        const { data } = await usersApi.getCities(
          user.role === 'COUNTRY' ? user.countryId : undefined,
        );
        const list = data?.data || data;
        setCities(Array.isArray(list) ? list : []);
      } catch (err) {
        console.error(err);
      }
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
      setimprezaEvents(Array.isArray(list) ? list : []);
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

    return { totalEvents, totalBracelets, avg, byColor };
  }, [expenses]);

  // ── Filtered & sorted expenses ─────────────────
  const filteredExpenses = useMemo(() => {
    let list = [...expenses];

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
    setimprezaEvents([]);

    if (user.role === 'CITY') {
      setCityId(user.cityId);
      // Auto-load events for this city
      const cityName = user.city?.name;
      if (cityName) {
        await loadimprezaEvents(cityName);
      } else {
        await loadimprezaEvents();
      }
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
    if (!eventName.trim()) { setError('Выберите расход из списка IMPREZA'); return; }

    const black = parseInt(quantities.black) || 0;
    const white = parseInt(quantities.white) || 0;
    const red = parseInt(quantities.red) || 0;
    const blue = parseInt(quantities.blue) || 0;

    if (black + white + red + blue === 0) {
      setError('Укажите количество браслетов');
      return;
    }

    setSending(true);
    try {
      await inventoryApi.createExpense({
        cityId: targetCityId,
        eventName: eventName.trim(),
        eventDate: eventDate || undefined,
        location: location.trim() || undefined,
        black, white, red, blue,
        notes: notes.trim() || undefined,
      });
      setShowCreate(false);
      resetForm();
      await loadExpenses();
    } catch (err) {
      setError(err.response?.data?.message || 'Ошибка создания расхода');
    } finally {
      setSending(false);
    }
  };

  const resetForm = () => {
    setCityId(user.role === 'CITY' ? user.cityId : '');
    setEventName('');
    setEventDate('');
    setLocation('');
    setQuantities({ black: '', white: '', red: '', blue: '' });
    setNotes('');
    setError('');
    setSelectedEvent('');
    setimprezaEvents([]);
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
        {user.role === 'CITY' && (
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
                    <span className="flex items-center gap-1">
                      <MapPin size={11} />
                      {ex.city?.name || 'Город'}
                    </span>
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

      {/* ── Create Expense Modal ──────────────────────── */}
      <Modal
        open={showCreate}
        onClose={() => { setShowCreate(false); resetForm(); }}
        title="Новый расход"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* IMPREZA events dropdown */}
          <div>
            <label className="block text-sm font-medium text-content-primary mb-1">
              Расход (IMPREZA)
            </label>
            {imprezaEvents.length > 0 ? (
                <select
                  value={selectedEvent}
                  onChange={handleEventSelect}
                  className="w-full rounded-[var(--radius-sm)] border border-edge text-sm px-3 py-2 bg-surface-card text-content-primary focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
                >
                  <option value="">— Выберите расход —</option>
                  {imprezaEvents.map((ev) => (
                    <option key={ev.id} value={String(ev.id)}>
                      {ev.title}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-sm text-content-muted bg-surface-secondary px-3 py-2.5 rounded-[var(--radius-sm)]">
                  Нет расходов IMPREZA для выбранного города
                </div>
              )}

              {/* Show selected event details */}
              {selectedEvent && eventName && (
                <div className="mt-2 bg-brand-600/10 text-brand-500 rounded-[var(--radius-sm)] px-3 py-2 text-sm space-y-0.5">
                  <div className="font-medium">{eventName}</div>
                  {eventDate && !isNaN(new Date(eventDate).getTime()) && (
                    <div className="text-xs flex items-center gap-1">
                      <CalendarDays size={12} />
                      {new Date(eventDate).toLocaleDateString('ru-RU')}
                    </div>
                  )}
                  {location && (
                    <div className="text-xs flex items-center gap-1">
                      <MapPin size={12} />
                      {location}
                    </div>
                  )}
                </div>
              )}
            </div>

          {/* Bracelet quantities */}
          <div>
            <p className="text-sm font-medium text-content-primary mb-2">Израсходовано браслетов</p>
            <div className="grid grid-cols-2 gap-3">
              {BRACELET_KEYS.map((key) => (
                <Input
                  key={key}
                  label={ITEM_LABELS[key.toUpperCase()]}
                  type="number"
                  min="0"
                  value={quantities[key]}
                  onChange={(e) => setQuantities((p) => ({ ...p, [key]: e.target.value }))}
                  placeholder="0"
                />
              ))}
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

          <Button type="submit" loading={sending} disabled={!selectedEvent} className="w-full">
            <TrendingDown size={18} /> Записать расход
          </Button>
        </form>
      </Modal>
    </div>
  );
}
