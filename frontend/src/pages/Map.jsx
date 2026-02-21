import { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { usersApi } from '../api/users';
import { transfersApi } from '../api/transfers';
import Badge from '../components/ui/Badge';

// Fix default marker icons (Leaflet + bundlers issue)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const countryIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const cityIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const statusColors = {
  SENT: '#3b82f6',
  ACCEPTED: '#22c55e',
  DISCREPANCY_FOUND: '#f97316',
  REJECTED: '#ef4444',
  CANCELLED: '#9ca3af',
};

export default function MapPage() {
  const [countries, setCountries] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [countriesRes, transfersRes] = await Promise.all([
        usersApi.getCountries(),
        transfersApi.getAll(),
      ]);
      setCountries(countriesRes.data || []);
      setTransfers(transfersRes.data?.data || transfersRes.data || []);
    } catch (err) {
      console.error('Map data loading error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Flatten cities from countries
  const allCities = useMemo(() => {
    const cities = [];
    countries.forEach((c) => {
      (c.cities || []).forEach((city) => {
        cities.push({ ...city, countryName: c.name });
      });
    });
    return cities;
  }, [countries]);

  // Filter transfers with valid coordinates
  const filteredTransfers = useMemo(() => {
    let list = transfers;
    if (statusFilter !== 'all') {
      list = list.filter((t) => t.status === statusFilter);
    }
    return list;
  }, [transfers, statusFilter]);

  // Build polylines from transfers
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

  // Status counts for filters
  const statusCounts = useMemo(() => {
    const counts = {};
    transfers.forEach((t) => {
      counts[t.status] = (counts[t.status] || 0) + 1;
    });
    return counts;
  }, [transfers]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-brand-200 border-t-brand-600 rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800">Карта трансферов</h2>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: 'all', label: `Все (${transfers.length})` },
          { key: 'SENT', label: `Отправлено (${statusCounts.SENT || 0})` },
          { key: 'ACCEPTED', label: `Принято (${statusCounts.ACCEPTED || 0})` },
          { key: 'DISCREPANCY_FOUND', label: `Расход. (${statusCounts.DISCREPANCY_FOUND || 0})` },
          { key: 'REJECTED', label: `Откл. (${statusCounts.REJECTED || 0})` },
          { key: 'CANCELLED', label: `Отм. (${statusCounts.CANCELLED || 0})` },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors
              ${statusFilter === key
                ? 'bg-brand-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: '#3b82f6' }} />
          Страна
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: '#22c55e' }} />
          Город
        </span>
      </div>

      {/* Map */}
      <div className="h-[calc(100vh-260px)] min-h-[400px] rounded-xl overflow-hidden border border-gray-200 shadow-sm">
        <MapContainer
          center={[51.5, 10.0]}
          zoom={5}
          className="h-full w-full"
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Country markers */}
          {countries
            .filter((c) => c.latitude && c.longitude && (c.latitude !== 0 || c.longitude !== 0))
            .map((c) => (
              <Marker key={`country-${c.id}`} position={[c.latitude, c.longitude]} icon={countryIcon}>
                <Popup>
                  <div className="text-sm">
                    <div className="font-bold">{c.name}</div>
                    <div className="text-gray-500">Страна ({c.code})</div>
                    <div className="text-gray-500">
                      Городов: {c.cities?.length || 0}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}

          {/* City markers */}
          {allCities
            .filter((c) => c.latitude && c.longitude && (c.latitude !== 0 || c.longitude !== 0))
            .map((city) => (
              <Marker key={`city-${city.id}`} position={[city.latitude, city.longitude]} icon={cityIcon}>
                <Popup>
                  <div className="text-sm">
                    <div className="font-bold">{city.name}</div>
                    <div className="text-gray-500">Город ({city.countryName})</div>
                    <div className="text-gray-500">Статус: {city.status}</div>
                  </div>
                </Popup>
              </Marker>
            ))}

          {/* Transfer route polylines */}
          {polylines.map((pl) => (
            <Polyline
              key={pl.id}
              positions={pl.positions}
              color={pl.color}
              weight={2}
              opacity={0.7}
              dashArray={pl.transfer.status === 'SENT' ? '8 4' : undefined}
            >
              <Popup>
                <div className="text-sm space-y-1">
                  <Badge status={pl.transfer.status} />
                  <div>
                    <span className="text-gray-500">
                      {pl.transfer.senderType === 'ADMIN' ? 'Админ' : (pl.transfer.senderCity?.name || pl.transfer.senderCountry?.name || '—')}
                    </span>
                    <span className="mx-1">→</span>
                    <span className="font-medium">
                      {pl.transfer.receiverCity?.name || pl.transfer.receiverCountry?.name || '—'}
                    </span>
                  </div>
                  <div className="text-gray-400">
                    {new Date(pl.transfer.createdAt).toLocaleString('ru-RU', {
                      day: '2-digit', month: '2-digit', year: '2-digit',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </div>
                </div>
              </Popup>
            </Polyline>
          ))}
        </MapContainer>
      </div>

      {/* Transfer count */}
      <div className="text-xs text-gray-400 text-right">
        {polylines.length > 0
          ? `Показано маршрутов на карте: ${polylines.length}`
          : 'Нет маршрутов с координатами для отображения'}
      </div>
    </div>
  );
}
