import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useFilterStore } from '../store/useAppStore';
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
  const { countryId: globalCountryId, cityId: globalCityId } = useFilterStore();
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

  // Recipient user picker (new user-based transfer model)
  const [toUserId, setToUserId] = useState('');
  const [recipientUsers, setRecipientUsers] = useState([]);
  const [recipientUsersLoading, setRecipientUsersLoading] = useState(false);

  // Confirmation step
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingPayload, setPendingPayload] = useState(null);

  // Sender balance (to validate before sending)
  const [senderBalance, setSenderBalance] = useState({ BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 });
  const [balanceLoading, setBalanceLoading] = useState(false);

  useEffect(() => {
    loadTransfers();
  }, [activeTab, globalCountryId, globalCityId]);

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
      if (globalCountryId) params.countryId = globalCountryId;
      if (globalCityId) params.cityId = globalCityId;

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
      // ADMIN and OFFICE get their balance from warehouse, not from inventory/my
      let payload;
      if (user.role === 'ADMIN' || user.role === 'OFFICE') {
        const { data } = await inventoryApi.getWarehouseBalance();
        payload = data?.data || data;
      } else {
        const { data } = await inventoryApi.getMy();
        payload = data?.data || data;
      }
      
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

    if (user.role === 'ADMIN' || user.role === 'OFFICE' || user.role === 'CITY' || user.role === 'USER') {
      try {
        const { data } = await usersApi.getCountries();
        const result = data.data || data;
        setCountries(Array.isArray(result) ? result : []);
      } catch (err) {
        console.error(err);
      }
      if (user.role === 'ADMIN' || user.role === 'OFFICE') {
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
      // Primary source: physical office entities (backend auto-creates for OFFICE users)
      const { data } = await usersApi.getOffices();
      const list = Array.isArray(data) ? data : (data?.data || []);

      if (Array.isArray(list) && list.length > 0) {
        setOffices(list);
        setOfficesLoading(false);
        return;
      }
    } catch (err) {
      console.error('Primary getOffices failed:', err);
    }

    // Fallback: users with role OFFICE
    try {
      const result = await usersApi.getAll({ role: 'OFFICE', limit: 500 });
      const usersList = Array.isArray(result.data)
        ? result.data
        : (result.data?.data || []);

      const mapped = usersList.map((u) => ({
        id: u.officeId || u.id,
        name: u.displayName ? `${u.displayName} (${u.username})` : u.username,
        code: u.office?.code || undefined,
        _source: 'user',
      }));

      setOffices(mapped);
    } catch (err) {
      console.error('Fallback getAll OFFICE failed:', err);
      setOffices([]);
    } finally {
      setOfficesLoading(false);
    }
  };

  const loadRecipientUsers = async (params) => {
    setRecipientUsersLoading(true);
    setRecipientUsers([]);
    try {
      const { data } = await usersApi.getAll({ ...params, limit: 500 });
      const list = data?.data || (Array.isArray(data) ? data : []);
      setRecipientUsers((Array.isArray(list) ? list : []).filter((u) => u.id !== user.id && u.isActive !== false));
    } catch (err) {
      console.error('loadRecipientUsers error:', err);
      setRecipientUsers([]);
    } finally {
      setRecipientUsersLoading(false);
    }
  };

  // Cascading: when country selected → load its cities + users
  const handleCountryChange = async (e) => {
    const cId = e.target.value;
    setToCountryId(cId);
    setToCityId('');
    setCities([]);
    setToUserId('');
    setRecipientUsers([]);

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
      loadRecipientUsers({ role: 'USER', countryId: cId });
    }
  };

  const handleCityChange = async (e) => {
    const cId = e.target.value;
    setToCityId(cId);
    setToUserId('');
    if (cId) {
      loadRecipientUsers({ role: 'USER', cityId: cId });
    } else if (toCountryId) {
      loadRecipientUsers({ role: 'USER', countryId: toCountryId });
    } else {
      setRecipientUsers([]);
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

    if (!toUserId) {
      setError('Выберите получателя');
      return;
    }

    const payload = {
      fromUserId: user.id,
      toUserId,
      items,
      notes: notes || undefined,
    };

    // Stage confirmation instead of sending immediately
    setPendingPayload(payload);
    setShowConfirm(true);
  };

  const executeSend = async () => {
    if (!pendingPayload) return;
    setSending(true);
    try {
      await transfersApi.create(pendingPayload);
      setShowConfirm(false);
      setShowCreate(false);
      setPendingPayload(null);
      resetForm();
      await loadTransfers();
    } catch (err) {
      setShowConfirm(false);
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
    setToUserId('');
    setRecipientUsers([]);
    setReceiverMode('location');
    setCities([]);
    setQuantities({ BLACK: '', WHITE: '', RED: '', BLUE: '' });
    setNotes('');
    setError('');
    setPendingPayload(null);
  };

  // Receiver label for the summary hint
  const receiverLabel = useMemo(() => {
    if (!toUserId) return null;
    const u = recipientUsers.find((ru) => ru.id === toUserId);
    if (!u) return null;
    const parts = [u.displayName || u.username];
    if (u.primaryCity?.name) parts.push(u.primaryCity.name);
    if (u.primaryCity?.country?.name) parts.push(u.primaryCity.country.name);
    else if (u.office?.name) parts.push(`Офис: ${u.office.name}`);
    return parts.join(' · ');
  }, [toUserId, recipientUsers]);

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
            {user.role === 'CITY' ? 'Отправки' : 'Мои отправки'}
          </h2>
          <p className="text-xs text-content-muted mt-0.5">
            {user.role === 'CITY' ? 'Отправка браслетов в страну или другой город' : 'Отправки от вашего аккаунта'}
          </p>
        </div>
        {['ADMIN', 'OFFICE', 'COUNTRY', 'CITY', 'USER'].includes(user.role) && (
          <Button onClick={openCreate} size="sm">
            <Plus size={18} /> {(user.role === 'CITY' || user.role === 'USER') ? 'Отправить' : 'Новая'}
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
        title={user.role === 'CITY' ? 'Новая отправка' : 'Новая отправка'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ADMIN/OFFICE: toggle between location and office */}
          {(user.role === 'ADMIN' || user.role === 'OFFICE') && (
            <div className="flex gap-1 bg-surface-secondary rounded-[var(--radius-sm)] p-1">
              {[
                { key: 'location', label: 'Страна / Город', tooltip: 'Отправить браслеты по стране или городу' },
                { key: 'office', label: 'Офис', tooltip: 'Отправить браслеты напрямую в другой офис' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => { setReceiverMode(tab.key); setToCountryId(''); setToCityId(''); setToOfficeId(''); setToUserId(''); setRecipientUsers([]); setCities([]); if (tab.key === 'office') loadRecipientUsers({ role: 'OFFICE' }); }}
                  title={tab.tooltip}
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

          {/* ADMIN/OFFICE/CITY/USER: country → city → user (cascading) */}
          {(user.role === 'ADMIN' || user.role === 'OFFICE' || user.role === 'CITY' || user.role === 'USER') && receiverMode === 'location' && (
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
                <Select
                  label="Город (необязательно)"
                  value={toCityId}
                  onChange={handleCityChange}
                  options={[
                    { value: '', label: citiesLoading ? 'Загрузка...' : '— Вся страна —' },
                    ...cities.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                />
              )}

              {/* Recipient user picker */}
              {(recipientUsersLoading || recipientUsers.length > 0) && (
                <Select
                  label={recipientUsersLoading ? 'Загрузка пользователей...' : 'Получатель'}
                  value={toUserId}
                  onChange={(e) => setToUserId(e.target.value)}
                  options={[
                    { value: '', label: recipientUsersLoading ? 'Загрузка...' : '— Выберите получателя —' },
                    ...recipientUsers.map((u) => ({
                      value: u.id,
                      label: `${u.displayName || u.username}${u.primaryCity ? ` · ${u.primaryCity.name}` : ''}`,
                    })),
                  ]}
                />
              )}
            </>
          )}

          {/* ADMIN/OFFICE: office receiver — pick an OFFICE user */}
          {(user.role === 'ADMIN' || user.role === 'OFFICE') && receiverMode === 'office' && (
            <Select
              label={recipientUsersLoading ? 'Загрузка офисов...' : 'Офис-получатель'}
              value={toUserId}
              onChange={(e) => setToUserId(e.target.value)}
              options={[
                { value: '', label: recipientUsersLoading ? 'Загрузка...' : recipientUsers.length === 0 ? 'Нет офисов' : '— Выберите офис —' },
                ...recipientUsers.map((u) => ({ value: u.id, label: u.displayName || u.username })),
              ]}
            />
          )}

          {/* COUNTRY: city → user picker */}
          {user.role === 'COUNTRY' && (
            <>
              <Select
                label="Город-получатель"
                value={toCityId}
                onChange={handleCityChange}
                options={[
                  { value: '', label: '— Выберите город —' },
                  ...cities.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
              {(recipientUsersLoading || recipientUsers.length > 0) && (
                <Select
                  label={recipientUsersLoading ? 'Загрузка пользователей...' : 'Получатель'}
                  value={toUserId}
                  onChange={(e) => setToUserId(e.target.value)}
                  options={[
                    { value: '', label: recipientUsersLoading ? 'Загрузка...' : '— Выберите получателя —' },
                    ...recipientUsers.map((u) => ({
                      value: u.id,
                      label: `${u.displayName || u.username}${u.primaryCity ? ` · ${u.primaryCity.name}` : ''}`,
                    })),
                  ]}
                />
              )}
            </>
          )}

          {/* CITY: now uses the same country→city selector as ADMIN/OFFICE above */}

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
                      title={`Доступно для отправки: ${senderBalance[type]} шт`}
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
                    title={`Макс: ${senderBalance[type]} шт`}
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
            <Send size={18} /> {user.role === 'CITY' ? 'Отправить' : 'Отправить'}
          </Button>
        </form>
      </Modal>

      {/* ── Confirm Send Modal ────────────────────────── */}
      <Modal
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        title="Подтвердите отправку"
      >
        <div className="space-y-4">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-sm text-amber-400 flex items-start gap-2">
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
            <span>Убедитесь, что данные верны. Отправку нельзя будет изменить после подтверждения.</span>
          </div>

          {receiverLabel && (
            <div className="space-y-1">
              <p className="text-xs text-content-muted">Получатель</p>
              <p className="text-sm font-semibold text-content-primary flex items-center gap-1.5">
                <Send size={14} className="text-brand-500" />
                {receiverLabel}
              </p>
            </div>
          )}

          {pendingPayload?.items && (
            <div className="space-y-1">
              <p className="text-xs text-content-muted">Браслеты</p>
              <div className="flex flex-wrap gap-2">
                {pendingPayload.items.map((item) => (
                  <span
                    key={item.itemType}
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      item.itemType === 'BLACK' ? 'bg-gray-800 text-gray-200'
                      : item.itemType === 'WHITE' ? 'bg-gray-200 text-gray-800'
                      : item.itemType === 'RED'   ? 'bg-red-600/20 text-red-400'
                      : 'bg-blue-600/20 text-blue-400'
                    }`}
                  >
                    {ITEM_LABELS[item.itemType]}: {item.quantity} шт
                  </span>
                ))}
              </div>
              <p className="text-xs text-content-muted mt-1">
                Итого: {pendingPayload.items.reduce((s, i) => s + i.quantity, 0)} шт
              </p>
            </div>
          )}

          {pendingPayload?.notes && (
            <div className="space-y-1">
              <p className="text-xs text-content-muted">Примечание</p>
              <p className="text-sm text-content-primary italic">{pendingPayload.notes}</p>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => setShowConfirm(false)}
              disabled={sending}
            >
              Назад
            </Button>
            <Button
              className="flex-1"
              loading={sending}
              onClick={executeSend}
            >
              <Send size={16} /> Подтвердить
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
