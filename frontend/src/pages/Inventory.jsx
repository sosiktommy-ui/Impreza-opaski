import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { inventoryApi } from '../api/inventory';
import { usersApi } from '../api/users';
import Card from '../components/ui/Card';
import Select from '../components/ui/Select';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import { Boxes, Plus, Minus } from 'lucide-react';

export default function Inventory() {
  const { user } = useAuthStore();
  const isAdminOrOffice = user.role === 'ADMIN' || user.role === 'OFFICE';
  const [balances, setBalances] = useState([]);
  const [countries, setCountries] = useState([]);
  const [cities, setCities] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [viewEntity, setViewEntity] = useState({ type: '', id: '' });
  const [loading, setLoading] = useState(true);
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ itemType: 'BLACK', delta: 0, reason: '' });
  const [adjusting, setAdjusting] = useState(false);

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    if (isAdminOrOffice) {
      // Admin/Office can view any entity
      const { data } = await usersApi.getCountries();
      const payload = data?.data || data;
      setCountries(Array.isArray(payload) ? payload : []);
      setLoading(false);
    } else if (user.role === 'COUNTRY') {
      // Load own balance + list cities
      setViewEntity({ type: 'COUNTRY', id: user.countryId });
      const [, citiesRes] = await Promise.all([
        loadBalance('COUNTRY', user.countryId),
        usersApi.getCities(user.countryId),
      ]);
      const citiesPayload = citiesRes.data?.data || citiesRes.data;
      setCities(Array.isArray(citiesPayload) ? citiesPayload : []);
    } else {
      // City — just load own balance
      setViewEntity({ type: 'CITY', id: user.cityId });
      await loadBalance('CITY', user.cityId);
    }
  };

  const loadBalance = async (entityType, entityId) => {
    try {
      const { data } = await inventoryApi.getBalance(entityType, entityId);
      const payload = data?.data || data;
      // Backend returns { BLACK: 0, WHITE: 0, ... } object, not array
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        setBalances(Object.entries(payload).map(([itemType, quantity]) => ({ itemType, quantity })));
      } else {
        setBalances(Array.isArray(payload) ? payload : []);
      }
    } catch (err) {
      console.error(err);
      setBalances([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCountrySelect = async (e) => {
    const cId = e.target.value;
    setSelectedCountry(cId);
    setSelectedCity('');
    if (cId) {
      setViewEntity({ type: 'COUNTRY', id: cId });
      await loadBalance('COUNTRY', cId);
      const { data } = await usersApi.getCities(cId);
      const payload = data?.data || data;
      setCities(Array.isArray(payload) ? payload : []);
    } else {
      setBalances([]);
      setCities([]);
    }
  };

  const handleCitySelect = async (e) => {
    const cId = e.target.value;
    setSelectedCity(cId);
    if (cId) {
      setViewEntity({ type: 'CITY', id: cId });
      await loadBalance('CITY', cId);
    } else if (selectedCountry) {
      setViewEntity({ type: 'COUNTRY', id: selectedCountry });
      await loadBalance('COUNTRY', selectedCountry);
    }
  };

  const handleCitySelectForCountry = async (e) => {
    const cId = e.target.value;
    setSelectedCity(cId);
    if (cId) {
      await loadBalance('CITY', cId);
    } else {
      await loadBalance('COUNTRY', user.countryId);
    }
  };

  const handleAdjust = async () => {
    if (!viewEntity.type || !viewEntity.id) return;
    setAdjusting(true);
    try {
      await inventoryApi.adjust({
        entityType: viewEntity.type,
        entityId: viewEntity.id,
        itemType: adjustForm.itemType,
        delta: parseInt(adjustForm.delta, 10),
        reason: adjustForm.reason || undefined,
      });
      setShowAdjust(false);
      setAdjustForm({ itemType: 'BLACK', delta: 0, reason: '' });
      await loadBalance(viewEntity.type, viewEntity.id);
    } catch (err) {
      alert(err.response?.data?.message || 'Ошибка корректировки');
    } finally {
      setAdjusting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-brand-200 border-t-brand-600 rounded-full" />
      </div>
    );
  }

  const balanceMap = {};
  balances.forEach((b) => { balanceMap[b.itemType] = b.quantity; });
  const totalBracelets = balances.reduce((sum, b) => sum + (b.quantity || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Остатки</h2>
        {isAdminOrOffice && viewEntity.type && viewEntity.id && (
          <Button onClick={() => setShowAdjust(true)} size="sm" variant="outline">
            <Plus size={16} /> Корректировка
          </Button>
        )}
      </div>

      {/* Admin/Office filters */}
      {isAdminOrOffice && (
        <Card>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Страна"
              value={selectedCountry}
              onChange={handleCountrySelect}
              options={[
                { value: '', label: '— Все страны —' },
                ...countries.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
            {cities.length > 0 && (
              <Select
                label="Город"
                value={selectedCity}
                onChange={handleCitySelect}
                options={[
                  { value: '', label: '— Все города —' },
                  ...cities.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
            )}
          </div>
        </Card>
      )}

      {/* Country filter for cities */}
      {user.role === 'COUNTRY' && cities.length > 0 && (
        <Card>
          <Select
            label="Показать остатки для"
            value={selectedCity}
            onChange={handleCitySelectForCountry}
            options={[
              { value: '', label: `${user.country?.name || 'Моя страна'} (общий)` },
              ...cities.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </Card>
      )}

      {/* Balance display */}
      {balances.length > 0 ? (
        <Card title={`Текущий баланс — ${totalBracelets} шт всего`}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {['BLACK', 'WHITE', 'RED', 'BLUE'].map((type) => {
              const colors = {
                BLACK: 'bg-gray-900 text-white',
                WHITE: 'bg-white border-2 border-gray-200 text-gray-800',
                RED: 'bg-red-600 text-white',
                BLUE: 'bg-blue-600 text-white',
              };
              const labels = { BLACK: 'Чёрные', WHITE: 'Белые', RED: 'Красные', BLUE: 'Синие' };
              return (
                <div
                  key={type}
                  className={`rounded-xl p-4 text-center ${colors[type]} shadow-sm`}
                >
                  <div className="text-3xl font-bold">{balanceMap[type] || 0}</div>
                  <div className="text-sm mt-1 opacity-80">{labels[type]}</div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-gray-500 text-center py-8">
            {isAdminOrOffice ? 'Выберите страну или город' : 'Нет данных'}
          </p>
        </Card>
      )}

      {/* Adjust balance modal */}
      <Modal open={showAdjust} onClose={() => setShowAdjust(false)} title="Корректировка остатков">
        <div className="space-y-4">
          <div className="text-sm text-gray-500">
            {viewEntity.type === 'COUNTRY' ? 'Страна' : 'Город'}:{' '}
            {viewEntity.type === 'COUNTRY'
              ? countries.find((c) => c.id === viewEntity.id)?.name || selectedCountry
              : cities.find((c) => c.id === viewEntity.id)?.name || selectedCity}
          </div>
          <Select
            label="Тип браслета"
            value={adjustForm.itemType}
            onChange={(e) => setAdjustForm((p) => ({ ...p, itemType: e.target.value }))}
            options={[
              { value: 'BLACK', label: 'Чёрный' },
              { value: 'WHITE', label: 'Белый' },
              { value: 'RED', label: 'Красный' },
              { value: 'BLUE', label: 'Синий' },
            ]}
          />
          <Input
            label="Количество (+ добавить, - убрать)"
            type="number"
            value={adjustForm.delta}
            onChange={(e) => setAdjustForm((p) => ({ ...p, delta: e.target.value }))}
          />
          <Input
            label="Причина (необязательно)"
            value={adjustForm.reason}
            onChange={(e) => setAdjustForm((p) => ({ ...p, reason: e.target.value }))}
            placeholder="Инвентаризация, списание и т.д."
          />
          <div className="flex gap-2">
            <Button
              onClick={() => { setAdjustForm((p) => ({ ...p, delta: Math.abs(p.delta || 0) })); handleAdjust(); }}
              loading={adjusting}
              className="flex-1"
            >
              <Plus size={16} /> Добавить
            </Button>
            <Button
              onClick={() => { setAdjustForm((p) => ({ ...p, delta: -Math.abs(p.delta || 0) })); handleAdjust(); }}
              loading={adjusting}
              variant="outline"
              className="flex-1"
            >
              <Minus size={16} /> Списать
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
