import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  MapContainer, TileLayer, Marker, Popup, Polyline,
  CircleMarker, Tooltip, useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { inventoryApi } from '../api/inventory';
import { useAuthStore } from '../store/useAuthStore';
import { useFilterStore } from '../store/useAppStore';
import { useThemeStore } from '../store/useThemeStore';
import { Maximize2, Minimize2 } from 'lucide-react';

// Fix default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ── Colored marker icons ─────────────────────
function makeIcon(color) {
  return new L.Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${color}.png`,
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
  });
}

const STATUS_ICONS = {
  ACTIVE: makeIcon('green'),
  LOW: makeIcon('orange'),
  INACTIVE: makeIcon('red'),
  DEFAULT: makeIcon('grey'),
};

const STATUS_META = {
  ACTIVE: { label: 'Активный', dot: 'bg-emerald-500', text: 'text-emerald-600' },
  LOW: { label: 'Мало', dot: 'bg-amber-500', text: 'text-amber-600' },
  INACTIVE: { label: 'Нет браслетов', dot: 'bg-red-500', text: 'text-red-600' },
};

const COUNTRY_ICON = makeIcon('blue');

const BRACELET_COLORS = {
  BLACK: { label: 'Чёрные', color: '#1f2937' },
  WHITE: { label: 'Белые', color: '#9ca3af' },
  RED: { label: 'Красные', color: '#ef4444' },
  BLUE: { label: 'Синие', color: '#3b82f6' },
};

// ── Tile layers ──────────────────────────────
const TILE_LIGHT = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const TILE_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTR = '&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>';

// ── FlyTo helper ─────────────────────────────
function FlyToLocation({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.flyTo(position, 8, { duration: 1.2 });
  }, [position, map]);
  return null;
}

// ── DynamicTiles — swap light/dark ───────────
function DynamicTiles({ dark }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
  }, [dark, map]);
  return <TileLayer attribution={TILE_ATTR} url={dark ? TILE_DARK : TILE_LIGHT} />;
}

export default function MapPage() {
  const { user } = useAuthStore();
  const { countryId: globalCountryId, cityId: globalCityId } = useFilterStore();
  const theme = useThemeStore((s) => s.theme);
  const darkMode = theme === 'dark';
  const [data, setData] = useState({ cities: [], countries: [], transferLines: [] });
  const [loading, setLoading] = useState(true);
  const [countryFilter, setCountryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [flyToPos, setFlyToPos] = useState(null);
  const [showPanel, setShowPanel] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const mapWrapRef = useRef(null);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement && mapWrapRef.current) {
      mapWrapRef.current.requestFullscreen?.();
      setFullscreen(true);
    } else if (document.fullscreenElement) {
      document.exitFullscreen?.();
      setFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  // Sync local filter with global filter
  useEffect(() => {
    if (globalCountryId) setCountryFilter(globalCountryId);
    else setCountryFilter('all');
  }, [globalCountryId]);

  useEffect(() => {
    if (globalCityId && data.cities.length) {
      const city = data.cities.find(c => c.id === globalCityId);
      if (city?.lat && city?.lng) setFlyToPos([city.lat, city.lng]);
    }
  }, [globalCityId, data.cities]);

  const loadData = async () => {
    try {
      const res = await inventoryApi.getMapData();
      const payload = res.data?.data || res.data;
      setData({
        cities: payload.cities || [],
        countries: payload.countries || [],
        transferLines: payload.transferLines || [],
      });
    } catch (err) {
      console.error('Map data loading error:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── Filters ────────────────────────────────
  const filteredCities = useMemo(() => {
    let list = data.cities;
    if (countryFilter !== 'all') {
      list = list.filter((c) => c.countryId === countryFilter);
    }
    if (statusFilter !== 'all') {
      list = list.filter((c) => c.status === statusFilter);
    }
    return list;
  }, [data.cities, countryFilter, statusFilter]);

  const filteredLines = useMemo(() => {
    if (countryFilter === 'all') return data.transferLines;
    return data.transferLines.filter((line) => {
      return filteredCities.some(
        (c) =>
          (Math.abs(c.latitude - line.fromLat) < 0.01 && Math.abs(c.longitude - line.fromLng) < 0.01) ||
          (Math.abs(c.latitude - line.toLat) < 0.01 && Math.abs(c.longitude - line.toLng) < 0.01),
      );
    });
  }, [data.transferLines, filteredCities, countryFilter]);

  // ── Stats ──────────────────────────────────
  const statusCounts = useMemo(() => {
    const counts = { ACTIVE: 0, LOW: 0, INACTIVE: 0 };
    filteredCities.forEach((c) => {
      if (counts[c.status] !== undefined) counts[c.status]++;
    });
    return counts;
  }, [filteredCities]);

  const totalStock = useMemo(() => {
    const totals = {};
    filteredCities.forEach((c) => {
      Object.entries(c.balance || {}).forEach(([type, qty]) => {
        totals[type] = (totals[type] || 0) + qty;
      });
    });
    return totals;
  }, [filteredCities]);

  const grandTotal = useMemo(
    () => Object.values(totalStock).reduce((a, b) => a + b, 0),
    [totalStock],
  );

  const maxLineVolume = useMemo(
    () => Math.max(1, ...filteredLines.map((l) => l.volume)),
    [filteredLines],
  );

  // Can filter by country: ADMIN or OFFICE
  const canFilterCountry = user?.role === 'ADMIN' || user?.role === 'OFFICE';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-brand-200 border-t-brand-600 rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">
          Карта
        </h2>
        <button
          onClick={() => setShowPanel(!showPanel)}
          className="text-xs px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          {showPanel ? 'Скрыть панель' : 'Показать панель'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {canFilterCountry && data.countries.length > 1 && (
          <select
            value={countryFilter}
            onChange={(e) => {
              setCountryFilter(e.target.value);
              if (e.target.value !== 'all') {
                const c = data.countries.find((ct) => ct.id === e.target.value);
                if (c?.latitude && c?.longitude) setFlyToPos([c.latitude, c.longitude]);
              }
            }}
            className="px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          >
            <option value="all">Все страны ({data.cities.length})</option>
            {data.countries.map((c) => {
              const cityCount = data.cities.filter((ct) => ct.countryId === c.id).length;
              return (
                <option key={c.id} value={c.id}>
                  {c.name} ({cityCount})
                </option>
              );
            })}
          </select>
        )}

        {[
          { key: 'all', label: `Все (${filteredCities.length})`, dot: 'bg-gray-400' },
          { key: 'ACTIVE', label: `Активные (${statusCounts.ACTIVE})`, dot: 'bg-emerald-500' },
          { key: 'LOW', label: `Мало (${statusCounts.LOW})`, dot: 'bg-amber-500' },
          { key: 'INACTIVE', label: `Пустые (${statusCounts.INACTIVE})`, dot: 'bg-red-500' },
        ].map(({ key, label, dot }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
              statusFilter === key
                ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 shadow-sm'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${dot}`} />
            {label}
          </button>
        ))}
      </div>

      {/* Info panel */}
      {showPanel && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
            <div className="text-2xl font-bold text-brand-600">{filteredCities.length}</div>
            <div className="text-xs text-gray-500 mt-1">Городов</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
            <div className="text-2xl font-bold text-emerald-600">{grandTotal.toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-1">Браслетов всего</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
            <div className="text-2xl font-bold text-blue-600">{filteredLines.length}</div>
            <div className="text-xs text-gray-500 mt-1">Маршрутов</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
            <div className="flex gap-2 mt-1">
              {Object.entries(totalStock)
                .sort(([, a], [, b]) => b - a)
                .map(([type, qty]) => {
                  const info = BRACELET_COLORS[type] || { label: type, color: '#6b7280' };
                  return (
                    <div key={type} className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full border border-gray-200" style={{ background: info.color }} />
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{qty}</span>
                    </div>
                  );
                })}
            </div>
            <div className="text-xs text-gray-500 mt-1">По цветам</div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-emerald-500" /> Активный
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-amber-500" /> Мало запасов
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-red-500" /> Нет запасов
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-blue-500" /> Страна
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-6 h-0 border-t-2 border-violet-500" /> Маршрут (толщина = объём)
        </span>
      </div>

      {/* Map */}
      <div
        ref={mapWrapRef}
        className={`relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm ${
          fullscreen ? 'h-screen w-screen' : 'h-[calc(100vh-260px)] min-h-[500px]'
        }`}
      >
        {/* Fullscreen button */}
        <button
          onClick={toggleFullscreen}
          className="absolute top-3 right-3 z-[999] p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm transition-colors"
          title={fullscreen ? 'Выйти из полноэкранного' : 'Полноэкранный режим'}
        >
          {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
        <MapContainer
          center={[48.5, 15.0]}
          zoom={5}
          className="h-full w-full"
          scrollWheelZoom={true}
        >
          <DynamicTiles dark={darkMode} />
          <FlyToLocation position={flyToPos} />

          {/* Country markers */}
          {data.countries
            .filter((c) => c.latitude && c.longitude && (countryFilter === 'all' || c.id === countryFilter))
            .map((c) => (
              <Marker key={`country-${c.id}`} position={[c.latitude, c.longitude]} icon={COUNTRY_ICON}>
                <Popup>
                  <div className="text-sm min-w-[160px]">
                    <div className="font-bold text-base">{c.name}</div>
                    <div className="text-gray-500">Страна ({c.code})</div>
                    <div className="text-gray-500 mt-1">
                      Городов:{' '}
                      <span className="font-medium text-gray-700">
                        {data.cities.filter((ct) => ct.countryId === c.id).length}
                      </span>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}

          {/* City markers — colored by status */}
          {filteredCities.map((city) => {
            const icon = STATUS_ICONS[city.status] || STATUS_ICONS.DEFAULT;
            const meta = STATUS_META[city.status] || { label: city.status, dot: 'bg-gray-400', text: 'text-gray-600' };
            const balance = city.balance || {};
            const hasStock = city.totalStock > 0;

            return (
              <Marker
                key={`city-${city.id}`}
                position={[city.latitude, city.longitude]}
                icon={icon}
              >
                <Popup maxWidth={280} minWidth={220}>
                  <div className="text-sm space-y-2">
                    <div>
                      <div className="font-bold text-base flex items-center gap-2">
                        {city.name}
                        <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                      </div>
                      <div className="text-gray-500 text-xs">
                        {city.countryName} · <span className={meta.text}>{meta.label}</span>
                      </div>
                    </div>

                    <div className="pt-1.5 border-t border-gray-100">
                      <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-1">
                        Запасы браслетов
                      </div>
                      {hasStock ? (
                        <div className="space-y-1">
                          {Object.entries(BRACELET_COLORS).map(([type, info]) => {
                            const qty = balance[type] || 0;
                            const pct = city.totalStock > 0 ? Math.round((qty / city.totalStock) * 100) : 0;
                            return (
                              <div key={type} className="flex items-center gap-1.5">
                                <span
                                  className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-gray-200"
                                  style={{ background: info.color }}
                                />
                                <span className="text-xs text-gray-600 flex-1">{info.label}</span>
                                <span className="text-xs font-semibold text-gray-800">{qty}</span>
                                <div className="w-12 h-1 bg-gray-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full"
                                    style={{ width: `${pct}%`, background: info.color }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                          <div className="text-xs text-gray-500 pt-1 border-t border-gray-50 flex justify-between">
                            <span>Итого:</span>
                            <span className="font-bold text-gray-800">{city.totalStock}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-red-500 font-medium">Нет запасов</div>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* Stock halo rings around cities */}
          {filteredCities
            .filter((c) => c.totalStock > 0)
            .map((city) => {
              const radius = Math.min(8 + Math.sqrt(city.totalStock) * 0.8, 30);
              const statusColor =
                city.status === 'ACTIVE' ? '#22c55e' :
                city.status === 'LOW' ? '#f59e0b' :
                '#ef4444';
              return (
                <CircleMarker
                  key={`halo-${city.id}`}
                  center={[city.latitude, city.longitude]}
                  radius={radius}
                  pathOptions={{
                    color: statusColor,
                    fillColor: statusColor,
                    fillOpacity: 0.1,
                    weight: 1.5,
                    opacity: 0.3,
                  }}
                >
                  <Tooltip
                    direction="top"
                    offset={[0, -radius]}
                    className="!bg-transparent !border-0 !shadow-none"
                  >
                    <span className="text-[10px] font-medium" style={{ color: statusColor }}>
                      {city.totalStock} шт
                    </span>
                  </Tooltip>
                </CircleMarker>
              );
            })}

          {/* Transfer route polylines — thickness by volume */}
          {filteredLines.map((line, idx) => {
            const weight = Math.max(2, Math.min(8, 2 + (line.volume / maxLineVolume) * 6));
            return (
              <Polyline
                key={`line-${idx}`}
                positions={[
                  [line.fromLat, line.fromLng],
                  [line.toLat, line.toLng],
                ]}
                color="#7c3aed"
                weight={weight}
                opacity={0.5}
                dashArray="6 4"
              >
                <Popup>
                  <div className="text-sm">
                    <div className="font-semibold text-violet-700">Маршрут</div>
                    <div className="text-xs text-gray-600 mt-1">
                      Объём за 90 дней:{' '}
                      <span className="font-bold">{line.volume.toLocaleString()}</span> шт
                    </div>
                  </div>
                </Popup>
              </Polyline>
            );
          })}
        </MapContainer>
      </div>

      {/* Footer */}
      <div className="text-xs text-gray-400 dark:text-gray-500 text-right">
        {filteredCities.length > 0
          ? `Показано городов: ${filteredCities.length} · Маршрутов: ${filteredLines.length}`
          : 'Нет данных для отображения'}
      </div>
    </div>
  );
}
