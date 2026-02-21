import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  MapContainer, TileLayer, Marker, Popup, Polyline,
  CircleMarker, Tooltip, useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { usersApi } from '../api/users';
import { transfersApi } from '../api/transfers';
import Badge from '../components/ui/Badge';

// Fix default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const countryIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

const cityIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

const statusColors = {
  SENT: '#3b82f6',
  ACCEPTED: '#22c55e',
  DISCREPANCY_FOUND: '#f97316',
  REJECTED: '#ef4444',
  CANCELLED: '#9ca3af',
};

const statusLabels = {
  SENT: 'Отправлено',
  ACCEPTED: 'Принято',
  DISCREPANCY_FOUND: 'Расхождение',
  REJECTED: 'Отклонено',
  CANCELLED: 'Отменено',
};

const braceletColorNames = {
  BLACK: { label: 'Чёрные', color: '#1f2937' },
  WHITE: { label: 'Белые', color: '#9ca3af' },
  RED: { label: 'Красные', color: '#ef4444' },
  BLUE: { label: 'Синие', color: '#3b82f6' },
};

function aggregateItems(transfersList) {
  const totals = {};
  transfersList.forEach((t) => {
    (t.items || []).forEach((item) => {
      const type = item.itemType || item.type || 'UNKNOWN';
      totals[type] = (totals[type] || 0) + (item.quantity || 0);
    });
  });
  return totals;
}

function getLocationLabel(t, direction) {
  if (direction === 'from') {
    if (t.senderType === 'ADMIN') return 'Админ';
    return t.senderCity?.name || t.senderCountry?.name || '—';
  }
  return t.receiverCity?.name || t.receiverCountry?.name || '—';
}

// ── FlyTo helper ─────────────────────────────
function FlyToLocation({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.flyTo(position, 8, { duration: 1.2 });
    }
  }, [position, map]);
  return null;
}

export default function MapPage() {
  const [countries, setCountries] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showStats, setShowStats] = useState(true);
  const [flyToPos, setFlyToPos] = useState(null);
  const [selectedRouteId, setSelectedRouteId] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [countriesRes, transfersRes] = await Promise.all([
        usersApi.getCountries(),
        transfersApi.getAll(),
      ]);
      setCountries(Array.isArray(countriesRes.data) ? countriesRes.data : []);
      const tData = transfersRes.data;
      setTransfers(Array.isArray(tData) ? tData : []);
    } catch (err) {
      console.error('Map data loading error:', err);
    } finally {
      setLoading(false);
    }
  };

  const allCities = useMemo(() => {
    const cities = [];
    countries.forEach((c) => {
      (c.cities || []).forEach((city) => {
        cities.push({ ...city, countryName: c.name });
      });
    });
    return cities;
  }, [countries]);

  const filteredTransfers = useMemo(() => {
    if (statusFilter === 'all') return transfers;
    return transfers.filter((t) => t.status === statusFilter);
  }, [transfers, statusFilter]);

  const polylines = useMemo(() => {
    return filteredTransfers
      .map((t) => {
        const from = t.senderCity || t.senderCountry;
        const to = t.receiverCity || t.receiverCountry;
        if (!from?.latitude || !to?.latitude) return null;
        if (from.latitude === 0 && from.longitude === 0) return null;
        if (to.latitude === 0 && to.longitude === 0) return null;
        return {
          id: t.id,
          positions: [
            [from.latitude, from.longitude],
            [to.latitude, to.longitude],
          ],
          color: statusColors[t.status] || '#6b7280',
          transfer: t,
        };
      })
      .filter(Boolean);
  }, [filteredTransfers]);

  const statusCounts = useMemo(() => {
    const counts = {};
    transfers.forEach((t) => { counts[t.status] = (counts[t.status] || 0) + 1; });
    return counts;
  }, [transfers]);

  const totalBraceletsByColor = useMemo(() => aggregateItems(transfers), [transfers]);
  const totalBracelets = useMemo(
    () => Object.values(totalBraceletsByColor).reduce((a, b) => a + b, 0),
    [totalBraceletsByColor],
  );

  const topRoutes = useMemo(() => {
    const routeMap = {};
    transfers.forEach((t) => {
      const from = getLocationLabel(t, 'from');
      const to = getLocationLabel(t, 'to');
      if (from === '—' || to === '—') return;
      const key = `${from} → ${to}`;
      if (!routeMap[key]) routeMap[key] = { from, to, count: 0, totalItems: 0, items: {} };
      routeMap[key].count += 1;
      (t.items || []).forEach((item) => {
        const type = item.itemType || item.type || 'UNKNOWN';
        const qty = item.quantity || 0;
        routeMap[key].totalItems += qty;
        routeMap[key].items[type] = (routeMap[key].items[type] || 0) + qty;
      });
    });
    return Object.values(routeMap).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [transfers]);

  const cityActivity = useMemo(() => {
    const activity = {};
    transfers.forEach((t) => {
      const fromCity = t.senderCity?.name;
      const toCity = t.receiverCity?.name;
      if (fromCity) {
        if (!activity[fromCity]) activity[fromCity] = { sent: 0, received: 0, items: 0 };
        activity[fromCity].sent += 1;
        (t.items || []).forEach((i) => { activity[fromCity].items += (i.quantity || 0); });
      }
      if (toCity) {
        if (!activity[toCity]) activity[toCity] = { sent: 0, received: 0, items: 0 };
        activity[toCity].received += 1;
      }
    });
    return activity;
  }, [transfers]);

  const recentTransfers = useMemo(() => {
    return [...transfers]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);
  }, [transfers]);

  // Click a route in the stats panel → fly to receiver + highlight
  const handleRouteClick = useCallback((t) => {
    const to = t.receiverCity || t.receiverCountry;
    if (to?.latitude && to?.longitude) {
      setFlyToPos([to.latitude, to.longitude]);
      setSelectedRouteId(t.id);
    }
  }, []);

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
        <h2 className="text-xl font-bold text-gray-800">Карта трансферов</h2>
        <button
          onClick={() => setShowStats(!showStats)}
          className="text-xs px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          {showStats ? 'Скрыть статистику' : 'Показать статистику'}
        </button>
      </div>

      {/* ── Statistics ────────────────────────────────── */}
      {showStats && (
        <div className="space-y-4">
          {/* Summary row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { value: transfers.length, label: 'Трансферов', color: 'text-brand-600' },
              { value: totalBracelets, label: 'Браслетов', color: 'text-emerald-600' },
              { value: polylines.length, label: 'Маршрутов', color: 'text-blue-600' },
              { value: `${countries.length} / ${allCities.length}`, label: 'Стран / Городов', color: 'text-gray-700' },
            ].map(({ value, label, color }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <div className={`text-2xl font-bold ${color}`}>{value}</div>
                <div className="text-xs text-gray-500 mt-1">{label}</div>
              </div>
            ))}
          </div>

          {/* Bracelets + Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Браслеты по цветам</h3>
              {Object.keys(totalBraceletsByColor).length === 0 ? (
                <div className="text-xs text-gray-400">Нет данных</div>
              ) : (
                <div className="space-y-2">
                  {Object.entries(totalBraceletsByColor)
                    .sort(([, a], [, b]) => b - a)
                    .map(([type, qty]) => {
                      const info = braceletColorNames[type] || { label: type, color: '#6b7280' };
                      const pct = totalBracelets > 0 ? Math.round((qty / totalBracelets) * 100) : 0;
                      return (
                        <div key={type} className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full flex-shrink-0 border border-gray-200"
                            style={{ background: info.color }}
                          />
                          <span className="text-xs text-gray-600 flex-1">{info.label}</span>
                          <span className="text-xs font-medium text-gray-800">{qty}</span>
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${pct}%`, background: info.color }}
                            />
                          </div>
                          <span className="text-[10px] text-gray-400 w-8 text-right">{pct}%</span>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Статусы трансферов</h3>
              {transfers.length === 0 ? (
                <div className="text-xs text-gray-400">Нет данных</div>
              ) : (
                <div className="space-y-2">
                  {Object.entries(statusColors).map(([status, color]) => {
                    const count = statusCounts[status] || 0;
                    const pct = transfers.length > 0 ? Math.round((count / transfers.length) * 100) : 0;
                    return (
                      <div
                        key={status}
                        className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 -mx-1 py-0.5 transition-colors"
                        onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}
                      >
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                        <span className="text-xs text-gray-600 flex-1">{statusLabels[status] || status}</span>
                        <span className="text-xs font-medium text-gray-800">{count}</span>
                        <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                        </div>
                        <span className="text-[10px] text-gray-400 w-8 text-right">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Top routes + Recent */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Популярные маршруты</h3>
              {topRoutes.length === 0 ? (
                <div className="text-xs text-gray-400">Нет данных о маршрутах</div>
              ) : (
                <div className="space-y-2">
                  {topRoutes.map((route, idx) => (
                    <div key={idx} className="flex items-start gap-2 py-1 border-b border-gray-50 last:border-0">
                      <span className="text-[10px] bg-brand-50 text-brand-700 rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 font-bold">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-800 truncate">
                          {route.from} → {route.to}
                        </div>
                        <div className="flex gap-2 mt-0.5 flex-wrap">
                          {Object.entries(route.items).map(([type, qty]) => {
                            const info = braceletColorNames[type] || { label: type, color: '#6b7280' };
                            return (
                              <span key={type} className="inline-flex items-center gap-0.5 text-[10px] text-gray-500">
                                <span className="w-2 h-2 rounded-full" style={{ background: info.color }} />
                                {qty}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-xs font-bold text-gray-700">{route.count}x</div>
                        <div className="text-[10px] text-gray-400">{route.totalItems} шт</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Последние трансферы</h3>
              {recentTransfers.length === 0 ? (
                <div className="text-xs text-gray-400">Нет трансферов</div>
              ) : (
                <div className="space-y-2">
                  {recentTransfers.map((t) => {
                    const itemsSummary = (t.items || [])
                      .map((i) => {
                        const info = braceletColorNames[i.itemType || i.type] || { label: i.itemType || i.type };
                        return `${info.label}: ${i.quantity || 0}`;
                      })
                      .join(', ');
                    return (
                      <div
                        key={t.id}
                        className={`flex items-start gap-2 py-1.5 border-b border-gray-50 last:border-0 cursor-pointer rounded px-1 -mx-1 transition-colors ${
                          selectedRouteId === t.id ? 'bg-violet-50' : 'hover:bg-gray-50'
                        }`}
                        onClick={() => handleRouteClick(t)}
                      >
                        <span
                          className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                          style={{ background: statusColors[t.status] || '#6b7280' }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-gray-800 truncate">
                            {getLocationLabel(t, 'from')} → {getLocationLabel(t, 'to')}
                          </div>
                          {itemsSummary && (
                            <div className="text-[10px] text-gray-400 truncate">{itemsSummary}</div>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-400 flex-shrink-0">
                          {new Date(t.createdAt).toLocaleDateString('ru-RU', {
                            day: '2-digit', month: '2-digit',
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Status filter pills ───────────────────────── */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: 'all', label: `Все (${transfers.length})`, color: '#6b7280' },
          { key: 'SENT', label: `Отправлено (${statusCounts.SENT || 0})`, color: statusColors.SENT },
          { key: 'ACCEPTED', label: `Принято (${statusCounts.ACCEPTED || 0})`, color: statusColors.ACCEPTED },
          { key: 'DISCREPANCY_FOUND', label: `Расход. (${statusCounts.DISCREPANCY_FOUND || 0})`, color: statusColors.DISCREPANCY_FOUND },
          { key: 'REJECTED', label: `Откл. (${statusCounts.REJECTED || 0})`, color: statusColors.REJECTED },
          { key: 'CANCELLED', label: `Отм. (${statusCounts.CANCELLED || 0})`, color: statusColors.CANCELLED },
        ].map(({ key, label, color }) => (
          <button
            key={key}
            onClick={() => { setStatusFilter(key); setSelectedRouteId(null); }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              statusFilter === key
                ? 'text-white shadow-sm'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
            style={statusFilter === key ? { background: color } : undefined}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Legend ─────────────────────────────────────── */}
      <div className="flex gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-blue-500" /> Страна
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-green-500" /> Город
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 h-0 border-t-2 border-dashed border-blue-500" /> В пути
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 h-0 border-t-2 border-green-500" /> Доставлено
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-violet-300 opacity-60" /> Активность
        </span>
      </div>

      {/* ── Map ───────────────────────────────────────── */}
      <div className="h-[calc(100vh-260px)] min-h-[500px] rounded-xl overflow-hidden border border-gray-200 shadow-sm">
        <MapContainer
          center={[51.5, 10.0]}
          zoom={5}
          className="h-full w-full"
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          />

          {/* FlyTo controller */}
          <FlyToLocation position={flyToPos} />

          {/* Activity halos for cities */}
          {allCities
            .filter((c) => c.latitude && c.longitude && (c.latitude !== 0 || c.longitude !== 0) && cityActivity[c.name])
            .map((city) => {
              const act = cityActivity[city.name];
              const totalAct = act.sent + act.received;
              const radius = Math.min(10 + totalAct * 4, 35);
              return (
                <CircleMarker
                  key={`halo-${city.id}`}
                  center={[city.latitude, city.longitude]}
                  radius={radius}
                  pathOptions={{
                    color: '#8b5cf6',
                    fillColor: '#a78bfa',
                    fillOpacity: 0.12,
                    weight: 1.5,
                    opacity: 0.35,
                  }}
                >
                  <Tooltip direction="top" offset={[0, -radius]} className="!bg-transparent !border-0 !shadow-none">
                    <span className="text-[10px] text-violet-600 font-medium">
                      {totalAct} {totalAct === 1 ? 'трансфер' : 'трансферов'}
                    </span>
                  </Tooltip>
                </CircleMarker>
              );
            })}

          {/* Country markers */}
          {countries
            .filter((c) => c.latitude && c.longitude && (c.latitude !== 0 || c.longitude !== 0))
            .map((c) => (
              <Marker key={`country-${c.id}`} position={[c.latitude, c.longitude]} icon={countryIcon}>
                <Popup>
                  <div className="text-sm min-w-[160px]">
                    <div className="font-bold text-base">{c.name}</div>
                    <div className="text-gray-500">Страна ({c.code})</div>
                    <div className="text-gray-500 mt-1">
                      Городов: <span className="font-medium text-gray-700">{c.cities?.length || 0}</span>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}

          {/* City markers */}
          {allCities
            .filter((c) => c.latitude && c.longitude && (c.latitude !== 0 || c.longitude !== 0))
            .map((city) => {
              const act = cityActivity[city.name];
              return (
                <Marker key={`city-${city.id}`} position={[city.latitude, city.longitude]} icon={cityIcon}>
                  <Popup>
                    <div className="text-sm min-w-[180px]">
                      <div className="font-bold text-base">{city.name}</div>
                      <div className="text-gray-500">{city.countryName}</div>
                      {act ? (
                        <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">Отправлено:</span>
                            <span className="font-medium">{act.sent}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">Получено:</span>
                            <span className="font-medium">{act.received}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">Браслетов:</span>
                            <span className="font-medium">{act.items}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400 mt-1">Нет активности</div>
                      )}
                    </div>
                  </Popup>
                </Marker>
              );
            })}

          {/* Transfer route polylines */}
          {polylines.map((pl) => {
            const t = pl.transfer;
            const items = t.items || [];
            const totalQty = items.reduce((acc, i) => acc + (i.quantity || 0), 0);
            const isSelected = pl.id === selectedRouteId;
            return (
              <Polyline
                key={pl.id}
                positions={pl.positions}
                color={isSelected ? '#7c3aed' : pl.color}
                weight={isSelected ? 5 : Math.min(2 + Math.floor(totalQty / 50), 6)}
                opacity={isSelected ? 1 : 0.7}
                dashArray={t.status === 'SENT' ? '8 4' : undefined}
                eventHandlers={{
                  click: () => {
                    setSelectedRouteId(isSelected ? null : pl.id);
                  },
                }}
              >
                <Popup>
                  <div className="text-sm min-w-[200px] space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge status={t.status} />
                      <span className="text-[10px] text-gray-400">#{t.id?.slice(-6) || '—'}</span>
                    </div>
                    <div className="text-xs">
                      <span className="text-gray-500">{getLocationLabel(t, 'from')}</span>
                      <span className="mx-1.5 text-gray-300">→</span>
                      <span className="font-semibold text-gray-800">{getLocationLabel(t, 'to')}</span>
                    </div>
                    {items.length > 0 && (
                      <div className="pt-1 border-t border-gray-100">
                        <div className="text-[10px] text-gray-400 mb-1">Браслеты:</div>
                        <div className="flex flex-wrap gap-1.5">
                          {items.map((item, idx) => {
                            const info = braceletColorNames[item.itemType || item.type] || { label: item.itemType || item.type, color: '#6b7280' };
                            return (
                              <span key={idx} className="inline-flex items-center gap-1 text-[11px] bg-gray-50 rounded px-1.5 py-0.5">
                                <span className="w-2 h-2 rounded-full" style={{ background: info.color }} />
                                <span className="font-medium">{item.quantity || 0}</span>
                              </span>
                            );
                          })}
                        </div>
                        <div className="text-[10px] text-gray-500 mt-1">
                          Итого: <span className="font-medium">{totalQty}</span> шт
                        </div>
                      </div>
                    )}
                    {t.notes && (
                      <div className="text-[10px] text-gray-400 italic pt-1 border-t border-gray-100">{t.notes}</div>
                    )}
                    <div className="text-[10px] text-gray-400">
                      {new Date(t.createdAt).toLocaleString('ru-RU', {
                        day: '2-digit', month: '2-digit', year: '2-digit',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </div>
                  </div>
                </Popup>
              </Polyline>
            );
          })}
        </MapContainer>
      </div>

      {/* ── Footer ────────────────────────────────────── */}
      <div className="text-xs text-gray-400 text-right">
        {polylines.length > 0
          ? `Показано маршрутов на карте: ${polylines.length} из ${transfers.length} трансферов`
          : 'Нет маршрутов с координатами для отображения'}
      </div>
    </div>
  );
}
