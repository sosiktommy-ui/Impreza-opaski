import { useState, useEffect, useMemo } from 'react';
import { Eye, ChevronRight, ArrowLeft } from 'lucide-react';
import { inventoryApi } from '../api/inventory';
import { useFilterStore } from '../store/useAppStore';
import BraceletBadge from '../components/ui/BraceletBadge';
import Skeleton from '../components/ui/Skeleton';

const BRACELET_ORDER = ['BLACK', 'WHITE', 'RED', 'BLUE'];

const STATUS_MAP = {
  GREEN: { label: 'OK', color: 'bg-emerald-500' },
  YELLOW: { label: 'Мало', color: 'bg-amber-500' },
  RED: { label: 'Критично', color: 'bg-red-500' },
};

function statusFromStock(total) {
  if (total <= 0) return 'RED';
  if (total < 50) return 'YELLOW';
  return 'GREEN';
}

function CountryCircle({ country, cities, onClick }) {
  const total = cities.reduce((s, c) => s + c.totalStock, 0);
  const status = statusFromStock(total);
  const st = STATUS_MAP[status];

  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-center gap-2 p-4 rounded-[var(--radius-md)] hover:bg-surface-card-hover transition-all"
    >
      <div className="relative">
        <div className="w-20 h-20 rounded-full bg-surface-card border-2 border-edge flex items-center justify-center text-2xl font-bold text-content-primary group-hover:border-brand-500/40 transition-colors">
          {country.code || country.name?.slice(0, 2).toUpperCase()}
        </div>
        <span className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full ${st.color} border-2 border-surface-primary`} />
      </div>
      <div className="text-center">
        <div className="text-sm font-medium text-content-primary">{country.name}</div>
        <div className="text-2xs text-content-muted">{cities.length} городов · {total} шт.</div>
      </div>
    </button>
  );
}

function CityRow({ city }) {
  const status = statusFromStock(city.totalStock);
  const st = STATUS_MAP[status];

  return (
    <div className="flex items-center gap-3 p-3 rounded-[var(--radius-sm)] hover:bg-surface-card-hover transition-colors">
      <div className="relative flex-shrink-0">
        <div className="w-10 h-10 rounded-full bg-surface-primary border border-edge flex items-center justify-center text-xs font-bold text-content-secondary">
          {city.name?.slice(0, 2).toUpperCase()}
        </div>
        <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ${st.color} border-2 border-surface-card`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-content-primary truncate">{city.name}</div>
        <div className="text-2xs text-content-muted">{city.totalStock} шт.</div>
      </div>
      <div className="flex items-center gap-1.5">
        {BRACELET_ORDER.map((type) => (
          <BraceletBadge key={type} type={type} count={city.balance?.[type] ?? 0} />
        ))}
      </div>
    </div>
  );
}

export default function Overview() {
  const { countryId: filterCountryId, cityId: filterCityId } = useFilterStore();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedCountry, setSelectedCountry] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const { data: resp } = await inventoryApi.getMapData();
      const result = resp.data || resp;
      setData(result);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const grouped = useMemo(() => {
    if (!data?.cities) return {};
    const map = {};
    for (const city of data.cities) {
      if (filterCityId && city.id !== filterCityId) continue;
      if (filterCountryId && city.countryId !== filterCountryId) continue;
      const cid = city.countryId;
      if (!map[cid]) map[cid] = [];
      map[cid].push(city);
    }
    return map;
  }, [data, filterCountryId, filterCityId]);

  const countries = useMemo(() => {
    const all = data?.countries || [];
    if (filterCountryId) return all.filter(c => c.id === filterCountryId);
    return all;
  }, [data, filterCountryId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-[var(--radius-md)]" />
          ))}
        </div>
      </div>
    );
  }

  if (selectedCountry) {
    const cities = grouped[selectedCountry.id] || [];
    const total = cities.reduce((s, c) => s + c.totalStock, 0);

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedCountry(null)}
            className="p-1.5 rounded-[var(--radius-sm)] hover:bg-surface-card-hover text-content-muted transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-lg font-bold text-content-primary">{selectedCountry.name}</h2>
            <p className="text-2xs text-content-muted">{cities.length} городов · Всего: {total} шт.</p>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-2">
          {BRACELET_ORDER.map((type) => {
            const sum = cities.reduce((s, c) => s + (c.balance?.[type] ?? 0), 0);
            return <BraceletBadge key={type} type={type} count={sum} />;
          })}
        </div>

        <div className="bg-surface-card border border-edge rounded-[var(--radius-md)] divide-y divide-edge">
          {cities.length === 0 ? (
            <p className="p-6 text-sm text-content-muted text-center">Нет городов</p>
          ) : (
            cities.map((city) => <CityRow key={city.id} city={city} />)
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-content-primary">Обзор</h2>

      {countries.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-content-muted gap-3">
          <Eye size={48} strokeWidth={1.2} />
          <p className="text-sm">Нет данных для отображения</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          {countries.map((country) => (
            <CountryCircle
              key={country.id}
              country={country}
              cities={grouped[country.id] || []}
              onClick={() => setSelectedCountry(country)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
