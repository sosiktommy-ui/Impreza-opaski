import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { transfersApi } from '../api/transfers';
import { usersApi } from '../api/users';
import { inventoryApi } from '../api/inventory';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import BraceletBadge, { BraceletRow } from '../components/ui/BraceletBadge';
import Pagination from '../components/ui/Pagination';
import { Plus, Send, X, Search, ArrowUpDown, AlertTriangle, ArrowRight } from 'lucide-react';
import { getSenderName, getReceiverName, isAdminTransfer, getTotalQuantity, getTransferCardClass } from '../utils/transferHelpers';

const ITEM_TYPES = ['BLACK', 'WHITE', 'RED', 'BLUE'];
const ITEM_LABELS = { BLACK: 'Чёрные', WHITE: 'Белые', RED: 'Красные', BLUE: 'Синие' };

export default function Transfers() {
  const { user } = useAuthStore();
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [countries, setCountries] = useState([]);
  const [cities, setCities] = useState([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('newest');
  const [activeTab, setActiveTab] = useState('active'); // 'active' = SENT, 'completed' = ACCEPTED

  // Form state — cascading: country → city (optional)
  const [toCountryId, setToCountryId] = useState('');
  const [toCityId, setToCityId] = useState('');
  const [quantities, setQuantities] = useState({ BLACK: '', WHITE: '', RED: '', BLUE: '' });
  const [notes, setNotes] = useState('');

  // Office receiver (for ADMIN)
  const [receiverMode, setReceiverMode] = useState('location'); // 'location' | 'office'
  const [offices, setOffices] = useState([]);
  const [officesLoading, setOfficesLoading] = useState(false);
  const [toOfficeId, setToOfficeId] = useState('');

  // Sender balance (to validate before sending)
  const [senderBalance, setSenderBalance] = useState({ BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 });
  const [balanceLoading, setBalanceLoading] = useState(false);

  useEffect(() => {
    loadTransfers();
  }, [activeTab]);

  const loadTransfers = async (p = 1) => {
    setLoading(true);
    try {
      const params = {
        page: p,
        limit: 30,
        direction: 'sent', // Only show transfers sent by current user
      };
      if (activeTab === 'active') params.status = 'SENT';
      else if (activeTab === 'completed') params.status = 'ACCEPTED';

      const { data } = await transfersApi.getAll(params);
      const result = data.data || data;
      const list = result.data || (Array.isArray(result) ? result : []);
      setTransfers(list);
      setTotalPages(result.meta?.totalPages || 1);
      setPage(result.meta?.page || p);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Filtered & sorted transfers (client-side search + sort)
  const filteredTransfers = useMemo(() => {
    let list = [...transfers];

    // Search by sender, receiver, id
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((t) => {
        const sender = getSenderName(t).toLowerCase();
        const receiver = getReceiverName(t).toLowerCase();
        const id = (t.id || '').toLowerCase();
        return sender.includes(q) || receiver.includes(q) || id.includes(q) ||
          (t.notes || '').toLowerCase().includes(q);
      });
    }

    // Sort
    list.sort((a, b) => {
      if (sortOrder === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
      if (sortOrder === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
      const aTot = getTotalQuantity(a);
      const bTot = getTotalQuantity(b);
      return sortOrder === 'most' ? bTot - aTot : aTot - bTot;
    });

    return list;
  }, [transfers, searchQuery, sortOrder]);

  const openCreate = async () => {
    setShowCreate(true);
    setError('');
    resetForm();

    // Load sender balance
    setBalanceLoading(true);
    try {
      const { data } = await inventoryApi.getMy();
      const payload = data?.data || data;
      if (payload && typeof payload === 'object') {
        setSenderBalance({
          BLACK: payload.BLACK || payload.black || 0,
          WHITE: payload.WHITE || payload.white || 0,
          RED: payload.RED || payload.red || 0,
          BLUE: payload.BLUE || payload.blue || 0,
        });
      }
    } catch (err) {
      console.error('Failed to load balance:', err);
      setSenderBalance({ BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 });
    } finally {
      setBalanceLoading(false);
    }

    if (user.role === 'ADMIN' || user.role === 'OFFICE') {
      try {
        const { data } = await usersApi.getCountries();
        const result = data.data || data;
        setCountries(Array.isArray(result) ? result : []);
      } catch (err) {
        console.error(err);
      }
      if (user.role === 'ADMIN') {
        loadOffices();
      }
    } else if (user.role === 'COUNTRY') {
      try {
        const { data } = await usersApi.getCities(user.countryId);
        setCities(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const loadOffices = async () => {
    setOfficesLoading(true);
    try {
      const res = await usersApi.getOffices();
      const payload = res.data?.data ?? res.data;
      const list = Array.isArray(payload) ? payload : [];
      setOffices(list);
    } catch (err) {
      console.error('Failed to load offices:', err);
    } finally {
      setOfficesLoading(false);
    }
  };

  // Cascading: when country selected → load its cities
  const handleCountryChange = async (e) => {
    const cId = e.target.value;
    setToCountryId(cId);
    setToCityId('');
    setCities([]);

    if (cId) {
      setCitiesLoading(true);
      try {
        const { data } = await usersApi.getCities(cId);
        setCities(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
      } finally {
        setCitiesLoading(false);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const items = ITEM_TYPES
      .filter((t) => quantities[t] && parseInt(quantities[t]) > 0)
      .map((t) => ({ itemType: t, quantity: parseInt(quantities[t]) }));

    if (items.length === 0) {
      setError('Укажите хотя бы один тип браслетов');
      return;
    }

    let receiverType, receiverCountryId, receiverCityId, receiverOfficeId;

    if (user.role === 'ADMIN' && receiverMode === 'office') {
      if (!toOfficeId) {
        setError('Выберите офис-получатель');
        return;
      }
      receiverType = 'OFFICE';
      receiverOfficeId = toOfficeId;
    } else if (user.role === 'ADMIN' || user.role === 'OFFICE') {
      if (!toCountryId) {
        setError('Выберите страну-получателя');
        return;
      }
      if (toCityId) {
        receiverType = 'CITY';
        receiverCityId = toCityId;
      } else {
        receiverType = 'COUNTRY';
        receiverCountryId = toCountryId;
      }
    } else if (user.role === 'COUNTRY') {
      if (!toCityId) {
        setError('Выберите город-получатель');
        return;
      }
      receiverType = 'CITY';
      receiverCityId = toCityId;
    } else if (user.role === 'CITY') {
      receiverType = 'COUNTRY';
      receiverCountryId = user.countryId;
    }

    const payload = {
      senderType: user.role === 'ADMIN' ? 'ADMIN' : user.role,
      senderOfficeId: user.role === 'OFFICE' ? user.officeId : undefined,
      senderCountryId: user.role === 'COUNTRY' ? user.countryId : undefined,
      senderCityId: user.role === 'CITY' ? user.cityId : undefined,
      receiverType,
      receiverOfficeId,
      receiverCountryId,
      receiverCityId,
      items,
      notes: notes || undefined,
    };

    setSending(true);
    try {
      await transfersApi.create(payload);
      setShowCreate(false);
      resetForm();
      await loadTransfers();
    } catch (err) {
      setError(err.response?.data?.message || 'Ошибка создания отправки');
    } finally {
      setSending(false);
    }
  };

  const handleCancel = async (id) => {
    if (!confirm('Отменить эту отправку?')) return;
    try {
      await transfersApi.cancel(id);
      await loadTransfers();
    } catch (err) {
      alert(err.response?.data?.message || 'Ошибка отмены');
    }
  };

  const resetForm = () => {
    setToCountryId('');
    setToCityId('');
    setToOfficeId('');
    setReceiverMode('location');
    setCities([]);
    setQuantities({ BLACK: '', WHITE: '', RED: '', BLUE: '' });
    setNotes('');
    setError('');
  };

  // Receiver label for the summary hint
  const receiverLabel = useMemo(() => {
    if (user.role === 'ADMIN' && receiverMode === 'office') {
      const office = offices.find((o) => o.id === toOfficeId);
      if (office) return `Офис: ${office.name}`;
      return null;
    }
    if (user.role === 'ADMIN' || user.role === 'OFFICE') {
      const country = countries.find((c) => c.id === toCountryId);
      const city = cities.find((c) => c.id === toCityId);
      if (city && country) return `${city.name} (${country.name})`;
      if (country) return country.name;
    }
    if (user.role === 'COUNTRY') {
      const city = cities.find((c) => c.id === toCityId);
      if (city) return city.name;
    }
    if (user.role === 'CITY') {
      return user.country?.name || 'Страна';
    }
    return null;
  }, [user.role, receiverMode, toCountryId, toCityId, toOfficeId, countries, cities, offices]);

  // Check if any quantity exceeds available balance
  const exceedsBalance = useMemo(() => {
    for (const type of ITEM_TYPES) {
      const qty = parseInt(quantities[type]) || 0;
      if (qty > 0 && qty > senderBalance[type]) {
        return true;
      }
    }
    return false;
  }, [quantities, senderBalance]);

  // Get which colors exceed balance for warning display
  const exceedingColors = useMemo(() => {
    const colors = [];
    for (const type of ITEM_TYPES) {
      const qty = parseInt(quantities[type]) || 0;
      if (qty > 0 && qty > senderBalance[type]) {
        colors.push(ITEM_LABELS[type]);
      }
    }
    return colors;
  }, [quantities, senderBalance]);

  if (loading && transfers.length === 0) {
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
          <h2 className="text-xl font-bold text-content-primary flex items-center gap-2">
            <Send size={22} className="text-brand-500" /> 
            {user.role === 'CITY' ? 'Возврат опасок' : 'Мои отправки'}
          </h2>
          <p className="text-xs text-content-muted mt-0.5">
            {user.role === 'CITY' ? 'Возврат браслетов в страну' : 'Отправки от вашего аккаунта'}
          </p>
        </div>
        {['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'].includes(user.role) && (
          <Button onClick={openCreate} size="sm">
            <Plus size={18} /> {user.role === 'CITY' ? 'Вернуть' : 'Новая'}
          </Button>
        )}
      </div>

      {/* ── Tabs: Не завершённые / Завершённые ──────── */}
      <div className="flex gap-1 bg-surface-secondary rounded-[var(--radius-sm)] p-1">
        {[
          { key: 'active', label: 'Не завершённые' },
          { key: 'completed', label: 'Завершённые' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setPage(1); }}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-surface-card text-content-primary'
                : 'text-content-secondary hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Filters Row ───────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
          <input
            type="text"
            placeholder="Поиск по отправителю или получателю..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-[var(--radius-sm)] border border-edge bg-surface-card text-content-primary text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
          />
        </div>
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

      {/* ── Transfers List ────────────────────────────── */}
      {filteredTransfers.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500 text-center py-6">
            {activeTab === 'active' ? 'Нет активных отправок' : 'Нет завершённых отправок'}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredTransfers.map((t) => {
            // Sender/Receiver info using helpers
            const from = getSenderName(t);
            const to = getReceiverName(t);
            const totalQty = getTotalQuantity(t);
            const isAdmin = isAdminTransfer(t);

            return (
              <div
                key={t.id}
                className={`bg-surface-card rounded-[var(--radius-md)] border border-edge hover:shadow-md transition-shadow overflow-hidden ${getTransferCardClass(t)}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge status={t.status} />
                      {isAdmin && <span className="text-xs px-1.5 py-0.5 bg-violet-500/20 text-violet-400 rounded font-medium">👑 ADMIN</span>}
                      <span className="text-xs text-content-muted">
                        {new Date(t.createdAt).toLocaleDateString('ru-RU', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}
                      </span>
                      <span className="text-xs text-content-muted font-mono">
                        #{t.id?.slice(-6) || '—'}
                      </span>
                    </div>

                    <div className="text-sm flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-blue-400 truncate max-w-[120px]" title={from}>{from}</span>
                      <ArrowRight size={14} className="text-content-muted flex-shrink-0" />
                      <span className="font-medium text-emerald-400 truncate max-w-[120px]" title={to}>{to}</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        {(t.items || []).map((item) => (
                          <BraceletBadge key={item.itemType || item.id} type={item.itemType} count={item.quantity} />
                        ))}
                      </div>
                      <span className="text-xs text-content-muted flex-shrink-0">
                        Итого: {totalQty} шт
                      </span>
                    </div>

                    {t.notes && (
                      <p className="text-xs text-content-muted italic">{t.notes}</p>
                    )}
                  </div>

                  {t.status === 'SENT' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCancel(t.id)}
                      className="flex-shrink-0 text-red-500 hover:text-red-700 hover:bg-red-500/10"
                    >
                      <X size={16} /> Отменить
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pagination ────────────────────────────────── */}
      {transfers.length > 0 && (
        <div className="space-y-2">
          <Pagination page={page} totalPages={totalPages} onPageChange={(p) => loadTransfers(p)} />
          <div className="text-xs text-content-muted text-right">
            Показано {filteredTransfers.length} из {transfers.length} отправок
          </div>
        </div>
      )}

      {/* ── Create Transfer Modal ─────────────────────── */}
      <Modal
        open={showCreate}
        onClose={() => { setShowCreate(false); resetForm(); }}
        title={user.role === 'CITY' ? 'Возврат опасок' : 'Новая отправка'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ADMIN: toggle between location and office */}
          {user.role === 'ADMIN' && (
            <div className="flex gap-1 bg-surface-secondary rounded-[var(--radius-sm)] p-1">
              {[
                { key: 'location', label: 'Страна / Город' },
                { key: 'office', label: 'Офис' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => { setReceiverMode(tab.key); setToCountryId(''); setToCityId(''); setToOfficeId(''); setCities([]); if (tab.key === 'office' && offices.length === 0) loadOffices(); }}
                  className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                    receiverMode === tab.key
                      ? 'bg-surface-card text-content-primary shadow-sm'
                      : 'text-content-secondary hover:text-content-primary'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {/* ADMIN/OFFICE: country → city (cascading) */}
          {(user.role === 'ADMIN' || user.role === 'OFFICE') && receiverMode === 'location' && (
            <>
              <Select
                label="Страна-получатель"
                value={toCountryId}
                onChange={handleCountryChange}
                options={[
                  { value: '', label: '— Выберите страну —' },
                  ...countries.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />

              {toCountryId && (
                <div>
                  <Select
                    label="Город (необязательно)"
                    value={toCityId}
                    onChange={(e) => setToCityId(e.target.value)}
                    options={[
                      { value: '', label: citiesLoading ? 'Загрузка...' : '— Вся страна —' },
                      ...cities.map((c) => ({ value: c.id, label: c.name })),
                    ]}
                  />
                  <p className="text-[11px] text-content-muted mt-1">
                    {toCityId
                      ? 'Отправка будет адресована выбранному городу'
                      : 'Если город не выбран — отправка пойдёт на уровень страны'}
                  </p>
                </div>
              )}
            </>
          )}

          {/* ADMIN: office receiver */}
          {user.role === 'ADMIN' && receiverMode === 'office' && (
            <Select
              label="Офис-получатель"
              value={toOfficeId}
              onChange={(e) => setToOfficeId(e.target.value)}
              options={[
                { value: '', label: officesLoading ? 'Загрузка...' : offices.length === 0 ? 'Нет офисов' : '— Выберите офис —' },
                ...offices.map((o) => ({ value: o.id, label: o.name })),
              ]}
            />
          )}

          {/* COUNTRY: just city selector */}
          {user.role === 'COUNTRY' && (
            <Select
              label="Город-получатель"
              value={toCityId}
              onChange={(e) => setToCityId(e.target.value)}
              options={[
                { value: '', label: '— Выберите город —' },
                ...cities.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          )}

          {/* CITY: auto-receiver is parent country */}
          {user.role === 'CITY' && (
            <div className="flex items-center gap-2 bg-surface-card text-content-secondary rounded-[var(--radius-sm)] px-3 py-2.5">
              <Send size={14} />
              <span className="text-sm">
                Возврат в: <strong>{user.country?.name || 'Страна'}</strong>
              </span>
            </div>
          )}

          {/* Receiver hint */}
          {receiverLabel && (
            <div className="flex items-center gap-2 bg-brand-600/10 text-brand-500 rounded-[var(--radius-sm)] px-3 py-2">
              <Send size={14} />
              <span className="text-sm">
                Получатель: <strong>{receiverLabel}</strong>
              </span>
            </div>
          )}

          {/* Sender Balance Display */}
          <div className="bg-surface-secondary rounded-[var(--radius-md)] p-3">
            <p className="text-xs font-medium text-content-muted mb-2">Ваш текущий баланс:</p>
            {balanceLoading ? (
              <div className="flex items-center gap-2 text-content-muted text-sm">
                <div className="animate-spin h-4 w-4 border-2 border-brand-200 border-t-brand-600 rounded-full" />
                Загрузка...
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {ITEM_TYPES.map((type) => {
                  const qty = parseInt(quantities[type]) || 0;
                  const exceeds = qty > 0 && qty > senderBalance[type];
                  return (
                    <div
                      key={type}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                        exceeds
                          ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500'
                          : type === 'BLACK'
                          ? 'bg-gray-800 text-gray-200'
                          : type === 'WHITE'
                          ? 'bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-200'
                          : type === 'RED'
                          ? 'bg-red-600/20 text-red-400'
                          : 'bg-blue-600/20 text-blue-400'
                      }`}
                    >
                      {ITEM_LABELS[type]}: {senderBalance[type]}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bracelet quantities */}
          <div>
            <p className="text-sm font-medium text-content-primary mb-2">Количество браслетов</p>
            <div className="grid grid-cols-2 gap-3">
              {ITEM_TYPES.map((type) => {
                const qty = parseInt(quantities[type]) || 0;
                const exceeds = qty > 0 && qty > senderBalance[type];
                return (
                  <Input
                    key={type}
                    label={ITEM_LABELS[type]}
                    type="number"
                    min="0"
                    max={senderBalance[type]}
                    value={quantities[type]}
                    onChange={(e) =>
                      setQuantities((p) => ({ ...p, [type]: e.target.value }))
                    }
                    placeholder="0"
                    className={exceeds ? 'ring-2 ring-red-500' : ''}
                  />
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

          {/* Warning if exceeds balance */}
          {exceedsBalance && (
            <div className="flex items-start gap-2 bg-amber-500/10 text-amber-400 text-sm px-3 py-2.5 rounded-[var(--radius-sm)]">
              <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Недостаточно браслетов!</p>
                <p className="text-xs mt-0.5 opacity-80">
                  Превышен баланс: {exceedingColors.join(', ')}
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 text-red-400 text-sm px-3 py-2 rounded-[var(--radius-sm)]">
              {error}
            </div>
          )}

          <Button type="submit" loading={sending} disabled={exceedsBalance || balanceLoading} className="w-full">
            <Send size={18} /> {user.role === 'CITY' ? 'Вернуть' : 'Отправить'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
