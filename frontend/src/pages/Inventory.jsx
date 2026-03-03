import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { inventoryApi } from '../api/inventory';
import { usersApi } from '../api/users';
import Card from '../components/ui/Card';
import Select from '../components/ui/Select';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import BraceletBadge from '../components/ui/BraceletBadge';
import { Boxes, Plus, Minus } from 'lucide-react';

const COLORS = ['BLACK', 'WHITE', 'RED', 'BLUE'];
const COLOR_LABELS = { BLACK: 'Чёрные', WHITE: 'Белые', RED: 'Красные', BLUE: 'Синие' };
const COLOR_STYLES = {
  BLACK: 'bg-gray-900 text-white',
  WHITE: 'bg-white border-2 border-gray-200 text-gray-800',
  RED: 'bg-red-600 text-white',
  BLUE: 'bg-blue-600 text-white',
};

export default function Inventory() {
  const { user } = useAuthStore();
  const isAdminOrOffice = user.role === 'ADMIN' || user.role === 'OFFICE';
  const [balances, setBalances] = useState([]);
  const [allInventory, setAllInventory] = useState([]);
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
      try {
        const [countriesRes, inventoryRes] = await Promise.all([
          usersApi.getCountries(),
          inventoryApi.getAll(),
        ]);
        const cPayload = countriesRes.data?.data || countriesRes.data;
        setCountries(Array.isArray(cPayload) ? cPayload : []);

        const iPayload = inventoryRes.data?.data || inventoryRes.data;
        setAllInventory(Array.isArray(iPayload) ? iPayload : []);
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    } else if (user.role === 'COUNTRY') {
      setViewEntity({ type: 'COUNTRY', id: user.countryId });
      const [, citiesRes] = await Promise.all([
        loadBalance('COUNTRY', user.countryId),
        usersApi.getCities(user.countryId),
      ]);
      const citiesPayload = citiesRes.data?.data || citiesRes.data;
      setCities(Array.isArray(citiesPayload) ? citiesPayload : []);
    } else {
      setViewEntity({ type: 'CITY', id: user.cityId });
      await loadBalance('CITY', user.cityId);
    }
  };

  // System-wide totals for Admin/Office
  const systemTotals = useMemo(() => {
    const totals = { BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 };
    allInventory.forEach((inv) => {
      if (totals[inv.itemType] !== undefined) {
        totals[inv.itemType] += inv.quantity || 0;
      }
    });
    return totals;
  }, [allInventory]);

  const systemTotal = useMemo(() =>
    Object.values(systemTotals).reduce((s, v) => s + v, 0),
  [systemTotals]);

  // Group inventory by country for Admin/Office overview
  const countryBreakdown = useMemo(() => {
    if (!isAdminOrOffice || allInventory.length === 0) return [];

    const countryMap = {};

    allInventory.forEach((inv) => {
      let countryId = null;
      let countryName = null;

      if (inv.entityType === 'COUNTRY' && inv.country) {
        countryId = inv.country.id;
        countryName = inv.country.name;
      } else if (inv.entityType === 'CITY' && inv.city) {
        countryId = inv.city.countryId;
        // We'll resolve the name from countries list
      } else if (inv.entityType === 'OFFICE') {
        // Office inventory shown separately
        return;
      }

      if (!countryId) return;

      if (!countryMap[countryId]) {
        const c = countries.find((ct) => ct.id === countryId);
        countryMap[countryId] = {
          id: countryId,
          name: countryName || c?.name || 'Неизвестно',
          totals: { BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 },
          cities: {},
        };
      }

      // Add to country totals
      if (inv.entityType === 'COUNTRY') {
        countryMap[countryId].totals[inv.itemType] = (countryMap[countryId].totals[inv.itemType] || 0) + (inv.quantity || 0);
      }

      // If city inventory, track per city
      if (inv.entityType === 'CITY' && inv.city) {
        const cityId = inv.city.id;
        if (!countryMap[countryId].cities[cityId]) {
          countryMap[countryId].cities[cityId] = {
            id: cityId,
            name: inv.city.name,
            totals: { BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 },
          };
        }
        countryMap[countryId].cities[cityId].totals[inv.itemType] = (inv.quantity || 0);
      }
    });

    return Object.values(countryMap).sort((a, b) => a.name.localeCompare(b.name));
  }, [allInventory, countries, isAdminOrOffice]);

  const loadBalance = async (entityType, entityId) => {
    try {
      const { data } = await inventoryApi.getBalance(entityType, entityId);
      const payload = data?.data || data;
      const VALID_TYPES = ['BLACK', 'WHITE', 'RED', 'BLUE'];
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        setBalances(
          Object.entries(payload)
            .filter(([key]) => VALID_TYPES.includes(key))
            .map(([itemType, quantity]) => ({ itemType, quantity: Number(quantity) || 0 }))
        );
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
      setViewEntity({ type: '', id: '' });
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
      // Refresh system totals
      if (isAdminOrOffice) {
        const { data } = await inventoryApi.getAll();
        const iPayload = data?.data || data;
        setAllInventory(Array.isArray(iPayload) ? iPayload : []);
      }
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

      {/* ── System Totals (Admin/Office) ──────────────── */}
      {isAdminOrOffice && allInventory.length > 0 && (
        <Card title={`Общий баланс системы — ${systemTotal} шт`}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {COLORS.map((type) => (
              <div key={type} className={`rounded-xl p-4 text-center ${COLOR_STYLES[type]} shadow-sm`}>
                <div className="text-3xl font-bold">{systemTotals[type]}</div>
                <div className="text-sm mt-1 opacity-80">{COLOR_LABELS[type]}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Country Breakdown Table (Admin/Office) ────── */}
      {isAdminOrOffice && countryBreakdown.length > 0 && !selectedCountry && (
        <Card title="Остатки по странам">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-400">
                  <th className="text-left py-2 px-2">Страна</th>
                  {COLORS.map((c) => (
                    <th key={c} className="text-center py-2 px-2">{COLOR_LABELS[c]}</th>
                  ))}
                  <th className="text-center py-2 px-2">Итого</th>
                </tr>
              </thead>
              <tbody>
                {countryBreakdown.map((country) => {
                  const countryTotal = Object.values(country.totals).reduce((s, v) => s + v, 0);
                  const citiesList = Object.values(country.cities);
                  const citiesTotal = {};
                  COLORS.forEach((c) => {
                    citiesTotal[c] = citiesList.reduce((s, city) => s + (city.totals[c] || 0), 0);
                  });
                  const allTotal = countryTotal + Object.values(citiesTotal).reduce((s, v) => s + v, 0);
                  return (
                    <tr
                      key={country.id}
                      className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => {
                        setSelectedCountry(country.id);
                        handleCountrySelect({ target: { value: country.id } });
                      }}
                    >
                      <td className="py-2.5 px-2 font-medium text-gray-700">{country.name}</td>
                      {COLORS.map((c) => (
                        <td key={c} className="text-center py-2.5 px-2 text-gray-600">
                          {(country.totals[c] || 0) + (citiesTotal[c] || 0)}
                        </td>
                      ))}
                      <td className="text-center py-2.5 px-2 font-semibold text-gray-800">{allTotal}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Admin/Office filters ──────────────────────── */}
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

      {/* Balance display for selected entity */}
      {balances.length > 0 && (selectedCountry || !isAdminOrOffice) ? (
        <Card title={`Текущий баланс — ${totalBracelets} шт всего`}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {COLORS.map((type) => (
              <div key={type} className={`rounded-xl p-4 text-center ${COLOR_STYLES[type]} shadow-sm`}>
                <div className="text-3xl font-bold">{balanceMap[type] || 0}</div>
                <div className="text-sm mt-1 opacity-80">{COLOR_LABELS[type]}</div>
              </div>
            ))}
          </div>
        </Card>
      ) : !isAdminOrOffice ? (
        <Card>
          <p className="text-sm text-gray-500 text-center py-8">Нет данных</p>
        </Card>
      ) : null}

      {/* ── City breakdown when country selected (Admin/Office) ── */}
      {isAdminOrOffice && selectedCountry && !selectedCity && (() => {
        const countryData = countryBreakdown.find((c) => c.id === selectedCountry);
        const citiesList = countryData ? Object.values(countryData.cities) : [];
        if (citiesList.length === 0) return null;
        return (
          <Card title="Города">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs text-gray-400">
                    <th className="text-left py-2 px-2">Город</th>
                    {COLORS.map((c) => (
                      <th key={c} className="text-center py-2 px-2">{COLOR_LABELS[c]}</th>
                    ))}
                    <th className="text-center py-2 px-2">Итого</th>
                  </tr>
                </thead>
                <tbody>
                  {citiesList.sort((a, b) => a.name.localeCompare(b.name)).map((city) => {
                    const cityTotal = Object.values(city.totals).reduce((s, v) => s + v, 0);
                    return (
                      <tr
                        key={city.id}
                        className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => {
                          setSelectedCity(city.id);
                          handleCitySelect({ target: { value: city.id } });
                        }}
                      >
                        <td className="py-2.5 px-2 font-medium text-gray-700">{city.name}</td>
                        {COLORS.map((c) => (
                          <td key={c} className="text-center py-2.5 px-2 text-gray-600">
                            {city.totals[c] || 0}
                          </td>
                        ))}
                        <td className="text-center py-2.5 px-2 font-semibold text-gray-800">{cityTotal}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })()}

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
