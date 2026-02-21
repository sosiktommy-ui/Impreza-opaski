import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { transfersApi } from '../api/transfers';
import { usersApi } from '../api/users';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import { BraceletRow } from '../components/ui/BraceletBadge';
import { Plus, Send, X } from 'lucide-react';

const ITEM_TYPES = ['BLACK', 'WHITE', 'RED', 'BLUE'];
const ITEM_LABELS = { BLACK: 'Чёрные', WHITE: 'Белые', RED: 'Красные', BLUE: 'Синие' };

export default function Transfers() {
  const { user } = useAuthStore();
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [countries, setCountries] = useState([]);
  const [cities, setCities] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [toType, setToType] = useState('');
  const [toCountryId, setToCountryId] = useState('');
  const [toCityId, setToCityId] = useState('');
  const [quantities, setQuantities] = useState({ BLACK: '', WHITE: '', RED: '', BLUE: '' });
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadTransfers();
  }, []);

  const loadTransfers = async () => {
    try {
      const { data } = await transfersApi.getAll();
      setTransfers(data.data || data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = async () => {
    setShowCreate(true);
    setError('');
    try {
      const { data } = await usersApi.getCountries();
      setCountries(data.data || data || []);
    } catch (err) {
      console.error(err);
    }

    // Determine available target types
    if (user.role === 'ADMIN') {
      setToType('COUNTRY'); // Admin can send to COUNTRY or CITY
    } else if (user.role === 'COUNTRY') {
      setToType('CITY'); // Country can send to its cities
      loadCitiesForCountry(user.countryId);
    }
  };

  const loadCitiesForCountry = async (countryId) => {
    try {
      const { data } = await usersApi.getCities(countryId);
      setCities(data.data || data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleToTypeChange = (e) => {
    setToType(e.target.value);
    setToCountryId('');
    setToCityId('');
    setCities([]);
  };

  const handleCountryChange = async (e) => {
    const cId = e.target.value;
    setToCountryId(cId);
    setToCityId('');
    if (toType === 'CITY' && cId) {
      await loadCitiesForCountry(cId);
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

    const senderType = user.role === 'ADMIN' ? 'ADMIN' : user.role;
    const payload = {
      senderType,
      senderCountryId: user.role === 'COUNTRY' ? user.countryId : undefined,
      senderCityId: user.role === 'CITY' ? user.cityId : undefined,
      receiverType: toType,
      receiverCountryId: toType === 'COUNTRY' ? toCountryId : undefined,
      receiverCityId: toType === 'CITY' ? toCityId : undefined,
      items,
      notes: notes || undefined,
    };

    if (toType === 'COUNTRY' && !toCountryId) {
      setError('Выберите получателя');
      return;
    }
    if (toType === 'CITY' && !toCityId) {
      setError('Выберите получателя');
      return;
    }

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
    setToType(user.role === 'ADMIN' ? 'COUNTRY' : 'CITY');
    setToCountryId('');
    setToCityId('');
    setQuantities({ BLACK: '', WHITE: '', RED: '', BLUE: '' });
    setNotes('');
    setError('');
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
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Отправки</h2>
        <Button onClick={openCreate} size="sm">
          <Plus size={18} /> Новая
        </Button>
      </div>

      {/* Transfers list */}
      {transfers.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500 text-center py-8">Нет отправок</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {transfers.map((t) => (
            <Card key={t.id}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Badge status={t.status} />
                    <span className="text-xs text-gray-400">
                      {new Date(t.createdAt).toLocaleDateString('ru-RU')}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-500">
                      {t.fromType === 'ADMIN' ? 'Админ' : t.fromEntity?.name || t.fromType}
                    </span>
                    <span className="mx-2 text-gray-300">→</span>
                    <span className="font-medium">{t.toEntity?.name || t.toType}</span>
                  </div>
                  <BraceletRow items={t.items} size="sm" />
                  {t.notes && <p className="text-xs text-gray-400 mt-1">{t.notes}</p>}
                </div>

                {t.status === 'SENT' && t.senderId === user.id && (
                  <Button variant="ghost" size="sm" onClick={() => handleCancel(t.id)}>
                    <X size={16} /> Отменить
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create transfer modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); resetForm(); }} title="Новая отправка">
        <form onSubmit={handleSubmit} className="space-y-4">
          {user.role === 'ADMIN' && (
            <Select
              label="Тип получателя"
              value={toType}
              onChange={handleToTypeChange}
              options={[
                { value: '', label: '— Выберите —' },
                { value: 'COUNTRY', label: 'Страна' },
                { value: 'CITY', label: 'Город' },
              ]}
            />
          )}

          {(toType === 'COUNTRY' || (toType === 'CITY' && user.role === 'ADMIN')) && (
            <Select
              label="Страна"
              value={toType === 'COUNTRY' ? toCountryId : toCountryId}
              onChange={handleCountryChange}
              options={[
                { value: '', label: '— Выберите страну —' },
                ...countries.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          )}

          {toType === 'CITY' && (
            <Select
              label="Город"
              value={toCityId}
              onChange={(e) => setToCityId(e.target.value)}
              options={[
                { value: '', label: '— Выберите город —' },
                ...cities.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          )}

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
            <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg">{error}</div>
          )}

          <Button type="submit" loading={sending} className="w-full">
            <Send size={18} /> Отправить
          </Button>
        </form>
      </Modal>
    </div>
  );
}
