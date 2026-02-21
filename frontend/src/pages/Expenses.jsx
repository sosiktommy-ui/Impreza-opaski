import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { inventoryApi } from '../api/inventory';
import { usersApi } from '../api/users';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import { BraceletRow } from '../components/ui/BraceletBadge';
import { CalendarDays, Plus } from 'lucide-react';

const ITEM_LABELS = { BLACK: 'Чёрные', WHITE: 'Белые', RED: 'Красные', BLUE: 'Синие' };

export default function Expenses() {
  const { user } = useAuthStore();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [cities, setCities] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  // Form
  const [cityId, setCityId] = useState('');
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [location, setLocation] = useState('');
  const [quantities, setQuantities] = useState({ black: '', white: '', red: '', blue: '' });
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadExpenses();
  }, []);

  const loadExpenses = async () => {
    try {
      const { data } = await inventoryApi.getExpenses();
      const list = Array.isArray(data) ? data : (data?.data || []);
      setExpenses(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = async () => {
    setShowCreate(true);
    setError('');

    // Pre-fill cityId for CITY users
    if (user.role === 'CITY') {
      setCityId(user.cityId);
    } else {
      // Load cities for selection
      try {
        const { data } = await usersApi.getCities(
          user.role === 'COUNTRY' ? user.countryId : undefined,
        );
        setCities(Array.isArray(data) ? data : (data?.data || data || []));
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const targetCityId = user.role === 'CITY' ? user.cityId : cityId;
    if (!targetCityId) {
      setError('Выберите город');
      return;
    }
    if (!eventName.trim()) {
      setError('Укажите название мероприятия');
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

    setSending(true);
    try {
      await inventoryApi.createExpense({
        cityId: targetCityId,
        eventName: eventName.trim(),
        eventDate: eventDate || undefined,
        location: location.trim() || undefined,
        black,
        white,
        red,
        blue,
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
        <h2 className="text-xl font-bold text-gray-800">Мероприятия</h2>
        {(user.role === 'CITY' || user.role === 'COUNTRY') && (
          <Button onClick={openCreate} size="sm">
            <Plus size={18} /> Новое
          </Button>
        )}
      </div>

      {expenses.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500 text-center py-8">Нет мероприятий</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {expenses.map((ex) => (
            <Card key={ex.id}>
              <div className="space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium text-gray-800 flex items-center gap-2">
                      <CalendarDays size={16} className="text-brand-500" />
                      {ex.eventName}
                    </div>
                    {ex.location && (
                      <div className="text-xs text-gray-400 mt-0.5">{ex.location}</div>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">
                    {ex.eventDate
                      ? new Date(ex.eventDate).toLocaleDateString('ru-RU')
                      : new Date(ex.createdAt).toLocaleDateString('ru-RU')}
                  </div>
                </div>

                <BraceletRow
                  items={{ BLACK: ex.black, WHITE: ex.white, RED: ex.red, BLUE: ex.blue }}
                  size="sm"
                />

                <div className="text-xs text-gray-400">
                  {ex.city?.name || 'Город'}
                  {ex.notes && ` • ${ex.notes}`}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create expense modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); resetForm(); }} title="Новое мероприятие">
        <form onSubmit={handleSubmit} className="space-y-4">
          {user.role !== 'CITY' && (
            <Select
              label="Город"
              value={cityId}
              onChange={(e) => setCityId(e.target.value)}
              options={[
                { value: '', label: '— Выберите город —' },
                ...cities.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          )}

          <Input
            label="Название мероприятия"
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            placeholder="Например: Фестиваль красок"
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Дата"
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
            />
            <Input
              label="Место"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Парк, площадь..."
            />
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Израсходовано браслетов</p>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label={ITEM_LABELS.BLACK}
                type="number"
                min="0"
                value={quantities.black}
                onChange={(e) => setQuantities((p) => ({ ...p, black: e.target.value }))}
                placeholder="0"
              />
              <Input
                label={ITEM_LABELS.WHITE}
                type="number"
                min="0"
                value={quantities.white}
                onChange={(e) => setQuantities((p) => ({ ...p, white: e.target.value }))}
                placeholder="0"
              />
              <Input
                label={ITEM_LABELS.RED}
                type="number"
                min="0"
                value={quantities.red}
                onChange={(e) => setQuantities((p) => ({ ...p, red: e.target.value }))}
                placeholder="0"
              />
              <Input
                label={ITEM_LABELS.BLUE}
                type="number"
                min="0"
                value={quantities.blue}
                onChange={(e) => setQuantities((p) => ({ ...p, blue: e.target.value }))}
                placeholder="0"
              />
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
            Записать расход
          </Button>
        </form>
      </Modal>
    </div>
  );
}
