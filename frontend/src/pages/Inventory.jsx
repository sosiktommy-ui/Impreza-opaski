import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { inventoryApi } from '../api/inventory';
import { usersApi } from '../api/users';
import Card from '../components/ui/Card';
import Select from '../components/ui/Select';
import { BraceletRow } from '../components/ui/BraceletBadge';
import { Boxes } from 'lucide-react';

export default function Inventory() {
  const { user } = useAuthStore();
  const [balances, setBalances] = useState([]);
  const [countries, setCountries] = useState([]);
  const [cities, setCities] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [viewEntity, setViewEntity] = useState({ type: '', id: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    if (user.role === 'ADMIN') {
      // Admin can view any entity
      const { data } = await usersApi.getCountries();
      setCountries(data.data || data || []);
      setLoading(false);
    } else if (user.role === 'COUNTRY') {
      // Load own balance + list cities
      setViewEntity({ type: 'COUNTRY', id: user.countryId });
      const [, citiesRes] = await Promise.all([
        loadBalance('COUNTRY', user.countryId),
        usersApi.getCities(user.countryId),
      ]);
      setCities(citiesRes.data?.data || citiesRes.data || []);
    } else {
      // City — just load own balance
      setViewEntity({ type: 'CITY', id: user.cityId });
      await loadBalance('CITY', user.cityId);
    }
  };

  const loadBalance = async (entityType, entityId) => {
    try {
      const { data } = await inventoryApi.getBalance(entityType, entityId);
      setBalances(data.data || data || []);
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
      setCities(data.data || data || []);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-brand-200 border-t-brand-600 rounded-full" />
      </div>
    );
  }

  const balanceMap = {};
  balances.forEach((b) => { balanceMap[b.itemType] = b.quantity; });

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800">Остатки</h2>

      {/* Admin filters */}
      {user.role === 'ADMIN' && (
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
        <Card title="Текущий баланс">
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
            {user.role === 'ADMIN' ? 'Выберите страну или город' : 'Нет данных'}
          </p>
        </Card>
      )}
    </div>
  );
}
