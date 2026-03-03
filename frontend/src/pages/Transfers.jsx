import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { transfersApi } from '../api/transfers';
import { usersApi } from '../api/users';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import BraceletBadge, { BraceletRow } from '../components/ui/BraceletBadge';
import Pagination from '../components/ui/Pagination';
import { Plus, Send, X, Search, ArrowUpDown } from 'lucide-react';

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

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((t) => {
        const to = t.receiverCity?.name || t.receiverCountry?.name || '';
        return to.toLowerCase().includes(q) ||
          (t.notes || '').toLowerCase().includes(q);
      });
    }

    // Sort
    list.sort((a, b) => {
      if (sortOrder === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
      if (sortOrder === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
      const aTot = (a.items || []).reduce((s, i) => s + (i.quantity || 0), 0);
      const bTot = (b.items || []).reduce((s, i) => s + (i.quantity || 0), 0);
      return sortOrder === 'most' ? bTot - aTot : aTot - bTot;
    });

    return list;
  }, [transfers, searchQuery, sortOrder]);

  const openCreate = async () => {
    setShowCreate(true);
    setError('');
    resetForm();

    if (user.role === 'ADMIN' || user.role === 'OFFICE') {
      try {
        const { data } = await usersApi.getCountries();
        const result = data.data || data;
        setCountries(Array.isArray(result) ? result : []);
      } catch (err) {
        console.error(err);
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

    if (user.role === 'ADMIN' || user.role === 'OFFICE') {
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
    setCities([]);
    setQuantities({ BLACK: '', WHITE: '', RED: '', BLUE: '' });
    setNotes('');
    setError('');
  };

  // Receiver label for the summary hint
  const receiverLabel = useMemo(() => {
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
  }, [user.role, toCountryId, toCityId, countries, cities]);

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
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Мои отправки</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Отправки от вашего аккаунта
          </p>
        </div>
        {['ADMIN', 'OFFICE', 'COUNTRY', 'CITY'].includes(user.role) && (
          <Button onClick={openCreate} size="sm">
            <Plus size={18} /> {user.role === 'CITY' ? 'Вернуть' : 'Новая'}
          </Button>
        )}
      </div>

      {/* ── Tabs: Не завершённые / Завершённые ──────── */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {[
          { key: 'active', label: 'Не завершённые' },
          { key: 'completed', label: 'Завершённые' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setPage(1); }}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Filters Row ───────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Поиск по получателю..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          />
        </div>
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          className="rounded-lg border border-gray-200 text-sm px-3 py-2 bg-white focus:border-brand-500 focus:outline-none"
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
          <p className="text-sm text-gray-500 text-center py-8">
            {activeTab === 'active' ? 'Нет активных отправок' : 'Нет завершённых отправок'}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredTransfers.map((t) => {
            const to =
              t.receiverType === 'ADMIN'
                ? 'Админ'
                : t.receiverType === 'OFFICE'
                  ? (t.receiverOffice?.name || 'Офис')
                  : t.receiverType === 'CITY'
                    ? `${t.receiverCity?.name || '—'}${t.receiverCity?.country?.name ? ` (${t.receiverCity.country.name})` : ''}`
                    : t.receiverCountry?.name || t.receiverType;
            const totalQty = (t.items || []).reduce((s, i) => s + (i.quantity || 0), 0);

            return (
              <div
                key={t.id}
                className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge status={t.status} />
                      <span className="text-xs text-gray-400">
                        {new Date(t.createdAt).toLocaleDateString('ru-RU', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </span>
                      <span className="text-xs text-gray-300 font-mono">
                        #{t.id?.slice(-6) || '—'}
                      </span>
                    </div>

                    <div className="text-sm flex items-center gap-1.5">
                      <span className="text-gray-300 flex-shrink-0">→</span>
                      <span className="font-medium text-gray-800 truncate">{to}</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        {(t.items || []).map((item) => (
                          <BraceletBadge key={item.itemType || item.id} type={item.itemType} count={item.quantity} />
                        ))}
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        Итого: {totalQty} шт
                      </span>
                    </div>

                    {t.notes && (
                      <p className="text-xs text-gray-400 italic">{t.notes}</p>
                    )}
                  </div>

                  {t.status === 'SENT' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCancel(t.id)}
                      className="flex-shrink-0 text-red-500 hover:text-red-700 hover:bg-red-50"
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
          <div className="text-xs text-gray-400 text-right">
            Показано {filteredTransfers.length} из {transfers.length} отправок
          </div>
        </div>
      )}

      {/* ── Create Transfer Modal ─────────────────────── */}
      <Modal
        open={showCreate}
        onClose={() => { setShowCreate(false); resetForm(); }}
        title="Новая отправка"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ADMIN/OFFICE: country → city (cascading) */}
          {(user.role === 'ADMIN' || user.role === 'OFFICE') && (
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
                  <p className="text-[11px] text-gray-400 mt-1">
                    {toCityId
                      ? 'Отправка будет адресована выбранному городу'
                      : 'Если город не выбран — отправка пойдёт на уровень страны'}
                  </p>
                </div>
              )}
            </>
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
            <div className="flex items-center gap-2 bg-gray-50 text-gray-600 rounded-lg px-3 py-2.5">
              <Send size={14} />
              <span className="text-sm">
                Отправка назад: <strong>{user.country?.name || 'Страна'}</strong>
              </span>
            </div>
          )}

          {/* Receiver hint */}
          {receiverLabel && (
            <div className="flex items-center gap-2 bg-brand-50 text-brand-700 rounded-lg px-3 py-2">
              <Send size={14} />
              <span className="text-sm">
                Получатель: <strong>{receiverLabel}</strong>
              </span>
            </div>
          )}

          {/* Bracelet quantities */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Количество браслетов</p>
            <div className="grid grid-cols-2 gap-3">
              {ITEM_TYPES.map((type) => (
                <Input
                  key={type}
                  label={ITEM_LABELS[type]}
                  type="number"
                  min="0"
                  value={quantities[type]}
                  onChange={(e) =>
                    setQuantities((p) => ({ ...p, [type]: e.target.value }))
                  }
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
            <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <Button type="submit" loading={sending} className="w-full">
            <Send size={18} /> Отправить
          </Button>
        </form>
      </Modal>
    </div>
  );
}
