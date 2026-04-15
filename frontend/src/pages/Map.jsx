import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  MapContainer, TileLayer, Marker, Popup, Polyline,
  CircleMarker, Tooltip, useMap, useMapEvents, GeoJSON,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { feature } from 'topojson-client';
import { inventoryApi } from '../api/inventory';
import { useAuthStore } from '../store/useAuthStore';
import { useFilterStore } from '../store/useAppStore';
import { useThemeStore } from '../store/useThemeStore';
import { Maximize2, Minimize2, X, ArrowRight } from 'lucide-react';
import Badge from '../components/ui/Badge';
import { ISO_NUMERIC_TO_ALPHA2 } from '../utils/countryMapping';

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
  BLACK: { label: 'Чёрные', color: '#1f2937', short: 'Ч' },
  WHITE: { label: 'Белые', color: '#9ca3af', short: 'Б' },
  RED: { label: 'Красные', color: '#ef4444', short: 'К' },
  BLUE: { label: 'Синие', color: '#3b82f6', short: 'С' },
};

const TRANSFER_STATUS_COLORS = {
  SENT: '#8b5cf6',           // violet
  ACCEPTED: '#22c55e',       // green
  REJECTED: '#ef4444',       // red
  DISCREPANCY_FOUND: '#f59e0b', // amber
  CANCELLED: '#6b7280',      // gray
};

// ── Tile layers ──────────────────────────────
const TILE_LIGHT = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const TILE_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTR = '&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>';

const ZOOM_THRESHOLD = 6;

// ── Color scale for country fill ──────────────
function getCountryColor(totalStock) {
  if (totalStock === 0) return '#ef444480';    // red
  if (totalStock < 100) return '#f59e0b60';    // amber
  if (totalStock < 500) return '#eab30850';    // yellow
  if (totalStock < 1000) return '#84cc1650';   // lime
  return '#22c55e50';                           // green
}

function getCountryBorderColor(totalStock) {
  if (totalStock === 0) return '#ef4444';
  if (totalStock < 100) return '#f59e0b';
  if (totalStock < 500) return '#eab308';
  if (totalStock < 1000) return '#84cc16';
  return '#22c55e';
}

// ── FlyTo helper ─────────────────────────────
function FlyToLocation({ position, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.flyTo(position, zoom || 8, { duration: 1.2 });
  }, [position, zoom, map]);
  return null;
}

// ── DynamicTiles — swap light/dark ───────────
function DynamicTiles({ dark }) {
  const map = useMap();
  useEffect(() => { map.invalidateSize(); }, [dark, map]);
  return <TileLayer attribution={TILE_ATTR} url={dark ? TILE_DARK : TILE_LIGHT} />;
}

// ── Zoom tracker ─────────────────────────────
function ZoomTracker({ onZoomChange }) {
  const map = useMapEvents({
    zoomend: () => onZoomChange(map.getZoom()),
  });
  useEffect(() => { onZoomChange(map.getZoom()); }, []);
  return null;
}

// ── Animated arrow decorator (CSS dashes) ────
function TransferArrow({ from, to, color, weight, opacity, children }) {
  // Offset overlapping lines slightly
  const midLat = (from[0] + to[0]) / 2;
  const midLng = (from[1] + to[1]) / 2;
  const dx = to[1] - from[1];
  const dy = to[0] - from[0];
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const offsetLat = midLat + (dx / len) * 0.15;
  const offsetLng = midLng - (dy / len) * 0.15;

  return (
    <Polyline
      positions={[from, [offsetLat, offsetLng], to]}
      color={color}
      weight={weight}
      opacity={opacity}
      dashArray="8 6"
    >
      {children}
    </Polyline>
  );
}

// ── Side Panel ───────────────────────────────
function SidePanel({ entity, type, transfers, onClose }) {
  if (!entity) return null;

  const balance = entity.balance || {};
  const total = type === 'country'
    ? entity.totalStock
    : Object.values(balance).reduce((a, b) => a + b, 0);

  const entityTransfers = (transfers || []).filter((t) => {
    if (type === 'country') {
      return t.senderCountryId === entity.id || t.receiverCountryId === entity.id;
    }
    const name = entity.name;
    return t.senderName === name || t.receiverName === name;
  }).slice(0, 15);

  return (
    <div className="absolute top-0 right-0 h-full w-80 bg-surface-card border-l border-edge shadow-xl z-[1000] overflow-y-auto">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-content-primary">{entity.name}</h3>
            <p className="text-xs text-content-muted">
              {type === 'country' ? `Страна · ${entity.code?.toUpperCase()} · ${entity.cityCount || 0} городов` : `${entity.countryName || ''}`}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-secondary transition-colors">
            <X size={18} className="text-content-muted" />
          </button>
        </div>

        {/* Status (city only) */}
        {type === 'city' && entity.status && (
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${STATUS_META[entity.status]?.dot || 'bg-gray-400'}`} />
            <span className={`text-sm font-medium ${STATUS_META[entity.status]?.text || 'text-gray-500'}`}>
              {STATUS_META[entity.status]?.label || entity.status}
            </span>
          </div>
        )}

        {/* Balance */}
        <div className="bg-surface-secondary rounded-[var(--radius-md)] p-3 space-y-2">
          <div className="text-xs text-content-muted font-medium uppercase tracking-wider">
            {type === 'country' ? 'Баланс (страна + города)' : 'Баланс браслетов'}
          </div>
          {Object.entries(BRACELET_COLORS).map(([itemType, info]) => {
            const qty = type === 'country'
              ? (balance[itemType] || 0) + (entity.cityBalance?.[itemType] || 0)
              : (balance[itemType] || 0);
            const pct = total > 0 ? Math.round((qty / total) * 100) : 0;
            return (
              <div key={itemType} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full border border-edge flex-shrink-0" style={{ background: info.color }} />
                <span className="text-sm text-content-secondary flex-1">{info.label}</span>
                <span className="text-sm font-bold text-content-primary">{qty}</span>
                <div className="w-16 h-1.5 bg-surface-primary rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: info.color }} />
                </div>
              </div>
            );
          })}
          <div className="flex justify-between pt-2 border-t border-edge">
            <span className="text-xs text-content-muted">Итого</span>
            <span className="text-sm font-bold text-content-primary">
              {type === 'country'
                ? Object.values(BRACELET_COLORS).reduce((s, _, i) => {
                    const t = Object.keys(BRACELET_COLORS)[i];
                    return s + (balance[t] || 0) + (entity.cityBalance?.[t] || 0);
                  }, 0)
                : total
              }
            </span>
          </div>
        </div>

        {/* Country sub-balance */}
        {type === 'country' && (
          <div className="bg-surface-secondary rounded-[var(--radius-md)] p-3 space-y-1">
            <div className="text-xs text-content-muted font-medium uppercase tracking-wider mb-2">Детализация</div>
            <div className="flex justify-between text-xs">
              <span className="text-content-secondary">На балансе страны:</span>
              <span className="font-medium text-content-primary">
                {Object.values(balance).reduce((a, b) => a + b, 0)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-content-secondary">В городах суммарно:</span>
              <span className="font-medium text-content-primary">
                {Object.values(entity.cityBalance || {}).reduce((a, b) => a + b, 0)}
              </span>
            </div>
          </div>
        )}

        {/* Recent transfers */}
        <div>
          <div className="text-xs text-content-muted font-medium uppercase tracking-wider mb-2">
            Последние трансферы ({entityTransfers.length})
          </div>
          {entityTransfers.length === 0 ? (
            <p className="text-xs text-content-muted py-3 text-center">Нет трансферов</p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {entityTransfers.map((t) => {
                const isOutgoing = t.senderName === entity.name || t.senderCountryId === entity.id;
                const statusColor = TRANSFER_STATUS_COLORS[t.status] || '#6b7280';
                return (
                  <div key={t.id} className="bg-surface-primary rounded-[var(--radius-sm)] p-2 text-xs space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: statusColor }} />
                      <span className="font-mono text-content-muted">#{t.id?.slice(-6)}</span>
                      <Badge status={t.status} />
                    </div>
                    <div className="flex items-center gap-1 text-content-secondary">
                      <span className={isOutgoing ? 'text-blue-400' : 'text-content-secondary'}>{t.senderName}</span>
                      <ArrowRight size={10} className="text-content-muted" />
                      <span className={!isOutgoing ? 'text-emerald-400' : 'text-content-secondary'}>{t.receiverName}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {(t.items || []).map((item) => (
                        <span key={item.itemType} className="text-[10px] px-1.5 py-0.5 rounded" style={{
                          background: (BRACELET_COLORS[item.itemType]?.color || '#6b7280') + '20',
                          color: BRACELET_COLORS[item.itemType]?.color || '#6b7280',
                        }}>
                          {BRACELET_COLORS[item.itemType]?.short || '?'}:{item.quantity}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MapPage() {
  const { user } = useAuthStore();
  const { countryId: globalCountryId, cityId: globalCityId } = useFilterStore();
  const theme = useThemeStore((s) => s.theme);
  const darkMode = theme === 'dark';
  const [data, setData] = useState({ cities: [], countries: [], transferLines: [], transfers: [] });
  const [loading, setLoading] = useState(true);
  const [countryFilter, setCountryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [flyToPos, setFlyToPos] = useState(null);
  const [flyToZoom, setFlyToZoom] = useState(null);
  const [showPanel, setShowPanel] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(5);
  const [geoJsonData, setGeoJsonData] = useState(null);
  const [selectedEntity, setSelectedEntity] = useState(null); // { entity, type: 'city'|'country' }
  const mapWrapRef = useRef(null);

  const isZoomedIn = zoomLevel >= ZOOM_THRESHOLD;

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

  // Load map data
  useEffect(() => { loadData(); }, []);

  // Load GeoJSON country boundaries
  useEffect(() => { loadGeoJson(); }, []);

  useEffect(() => {
    if (globalCountryId) setCountryFilter(globalCountryId);
    else setCountryFilter('all');
  }, [globalCountryId]);

  useEffect(() => {
    if (globalCityId && data.cities.length) {
      const city = data.cities.find(c => c.id === globalCityId);
      if (city?.latitude && city?.longitude) {
        setFlyToPos([city.latitude, city.longitude]);
        setFlyToZoom(10);
      }
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
        transfers: payload.transfers || [],
      });
    } catch (err) {
      console.error('Map data loading error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadGeoJson = async () => {
    try {
      const resp = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
      const topology = await resp.json();
      const world = feature(topology, topology.objects.countries);
      // Filter to only countries we care about
      const ourCodes = new Set(Object.keys(ISO_NUMERIC_TO_ALPHA2));
      const filtered = {
        ...world,
        features: world.features.filter((f) => ourCodes.has(String(f.id).padStart(3, '0'))),
      };
      setGeoJsonData(filtered);
    } catch (err) {
      console.error('Failed to load country boundaries:', err);
    }
  };

  // ── Filters ────────────────────────────────
  const filteredCities = useMemo(() => {
    let list = data.cities;
    if (countryFilter !== 'all') list = list.filter((c) => c.countryId === countryFilter);
    if (statusFilter !== 'all') list = list.filter((c) => c.status === statusFilter);
    return list;
  }, [data.cities, countryFilter, statusFilter]);

  const filteredTransfers = useMemo(() => {
    if (countryFilter === 'all') return data.transfers;
    return data.transfers.filter((t) =>
      t.senderCountryId === countryFilter || t.receiverCountryId === countryFilter
    );
  }, [data.transfers, countryFilter]);

  const filteredLines = useMemo(() => {
    if (countryFilter === 'all') return data.transferLines;
    return data.transferLines.filter((line) =>
      filteredCities.some(
        (c) =>
          (Math.abs(c.latitude - line.fromLat) < 0.01 && Math.abs(c.longitude - line.fromLng) < 0.01) ||
          (Math.abs(c.latitude - line.toLat) < 0.01 && Math.abs(c.longitude - line.toLng) < 0.01)
      )
    );
  }, [data.transferLines, filteredCities, countryFilter]);

  // ── Stats ──────────────────────────────────
  const statusCounts = useMemo(() => {
    const counts = { ACTIVE: 0, LOW: 0, INACTIVE: 0 };
    filteredCities.forEach((c) => { if (counts[c.status] !== undefined) counts[c.status]++; });
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

  const grandTotal = useMemo(() => Object.values(totalStock).reduce((a, b) => a + b, 0), [totalStock]);

  const maxLineVolume = useMemo(() => Math.max(1, ...filteredLines.map((l) => l.volume)), [filteredLines]);

  // Build country code → data lookup for GeoJSON styling
  const countryByCode = useMemo(() => {
    const map = {};
    data.countries.forEach((c) => { if (c.code) map[c.code.toLowerCase()] = c; });
    return map;
  }, [data.countries]);

  // ── GeoJSON style ──────────────────────────
  const geoJsonStyle = useCallback((feature) => {
    const numericId = String(feature.id).padStart(3, '0');
    const alpha2 = ISO_NUMERIC_TO_ALPHA2[numericId];
    const country = alpha2 ? countryByCode[alpha2] : null;
    const stock = country?.totalStock || 0;

    return {
      fillColor: getCountryColor(stock),
      color: getCountryBorderColor(stock),
      weight: isZoomedIn ? 1 : 2,
      fillOpacity: isZoomedIn ? 0.05 : 0.4,
      opacity: isZoomedIn ? 0.3 : 0.8,
    };
  }, [countryByCode, isZoomedIn]);

  const onEachCountryFeature = useCallback((feature, layer) => {
    const numericId = String(feature.id).padStart(3, '0');
    const alpha2 = ISO_NUMERIC_TO_ALPHA2[numericId];
    const country = alpha2 ? countryByCode[alpha2] : null;

    if (country) {
      layer.bindTooltip(
        `<strong>${country.name}</strong><br/>Всего: ${country.totalStock || 0} шт`,
        { sticky: true, className: 'leaflet-tooltip-custom' }
      );
      layer.on('click', () => {
        setSelectedEntity({ entity: country, type: 'country' });
        setFlyToPos([country.latitude, country.longitude]);
        setFlyToZoom(7);
      });
    }
  }, [countryByCode]);

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
        <h2 className="text-xl font-bold text-content-primary">Карта</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-content-muted px-2 py-1 rounded bg-surface-secondary">
            Zoom: {zoomLevel} · {isZoomedIn ? 'Города' : 'Страны'}
          </span>
          <button
            onClick={() => setShowPanel(!showPanel)}
            className="text-xs px-3 py-1.5 rounded-lg bg-surface-card border border-edge text-content-secondary hover:bg-surface-secondary transition-colors"
          >
            {showPanel ? 'Скрыть панель' : 'Показать панель'}
          </button>
        </div>
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
                if (c?.latitude && c?.longitude) {
                  setFlyToPos([c.latitude, c.longitude]);
                  setFlyToZoom(7);
                }
              }
            }}
            className="px-3 py-1.5 rounded-lg text-xs bg-surface-card border border-edge text-content-secondary focus:ring-2 focus:ring-brand-200 focus:outline-none"
          >
            <option value="all">Все страны ({data.cities.length})</option>
            {data.countries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.cityCount || 0} городов · {c.totalStock || 0} шт)
              </option>
            ))}
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
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-surface-card text-content-secondary hover:bg-surface-secondary border border-edge'
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
          <div className="bg-surface-card rounded-xl border border-edge p-4 shadow-sm">
            <div className="text-2xl font-bold text-brand-600">{filteredCities.length}</div>
            <div className="text-xs text-content-muted mt-1">Городов</div>
          </div>
          <div className="bg-surface-card rounded-xl border border-edge p-4 shadow-sm">
            <div className="text-2xl font-bold text-emerald-600">{grandTotal.toLocaleString()}</div>
            <div className="text-xs text-content-muted mt-1">Браслетов всего</div>
          </div>
          <div className="bg-surface-card rounded-xl border border-edge p-4 shadow-sm">
            <div className="text-2xl font-bold text-violet-600">{filteredTransfers.length}</div>
            <div className="text-xs text-content-muted mt-1">Трансферов (90д)</div>
          </div>
          <div className="bg-surface-card rounded-xl border border-edge p-4 shadow-sm">
            <div className="flex gap-2 mt-1">
              {Object.entries(totalStock)
                .sort(([, a], [, b]) => b - a)
                .map(([type, qty]) => {
                  const info = BRACELET_COLORS[type] || { label: type, color: '#6b7280' };
                  return (
                    <div key={type} className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full border border-edge" style={{ background: info.color }} />
                      <span className="text-xs font-medium text-content-secondary">{qty}</span>
                    </div>
                  );
                })}
            </div>
            <div className="text-xs text-content-muted mt-1">По цветам</div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-4 text-xs text-content-muted flex-wrap">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-emerald-500" /> Активный
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-amber-500" /> Мало
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-red-500" /> Нет запасов
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-6 h-0 border-t-2 border-violet-500" /> SENT
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-6 h-0 border-t-2 border-emerald-500" /> ACCEPTED
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-6 h-0 border-t-2 border-red-500" /> REJECTED
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-6 h-0 border-t-2 border-amber-500" /> DISCREPANCY
        </span>
      </div>

      {/* Map */}
      <div
        ref={mapWrapRef}
        className={`relative rounded-xl overflow-hidden border border-edge shadow-sm ${
          fullscreen ? 'h-screen w-screen' : 'h-[calc(100vh-260px)] min-h-[500px]'
        }`}
      >
        {/* Fullscreen button */}
        <button
          onClick={toggleFullscreen}
          className="absolute top-3 right-3 z-[999] p-2 rounded-lg bg-surface-card border border-edge text-content-secondary hover:bg-surface-secondary shadow-sm transition-colors"
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
          <FlyToLocation position={flyToPos} zoom={flyToZoom} />
          <ZoomTracker onZoomChange={setZoomLevel} />

          {/* ── COUNTRY BOUNDARIES (GeoJSON) ── */}
          {geoJsonData && (
            <GeoJSON
              key={`geo-${isZoomedIn}`}
              data={geoJsonData}
              style={geoJsonStyle}
              onEachFeature={onEachCountryFeature}
            />
          )}

          {/* ── COUNTRY MARKERS (zoom < threshold) ── */}
          {!isZoomedIn && data.countries
            .filter((c) => c.latitude && c.longitude && (countryFilter === 'all' || c.id === countryFilter))
            .map((c) => (
              <Marker
                key={`country-${c.id}`}
                position={[c.latitude, c.longitude]}
                icon={COUNTRY_ICON}
                eventHandlers={{
                  click: () => {
                    setSelectedEntity({ entity: c, type: 'country' });
                    setFlyToPos([c.latitude, c.longitude]);
                    setFlyToZoom(7);
                  }
                }}
              >
                <Tooltip direction="top" offset={[0, -20]} permanent={zoomLevel >= 4}>
                  <span className="text-xs font-bold">{c.name}: {c.totalStock || 0}</span>
                </Tooltip>
              </Marker>
            ))}

          {/* ── CITY MARKERS (zoom >= threshold) ── */}
          {isZoomedIn && filteredCities.map((city) => {
            const icon = STATUS_ICONS[city.status] || STATUS_ICONS.DEFAULT;
            const meta = STATUS_META[city.status] || { label: city.status, dot: 'bg-gray-400', text: 'text-gray-600' };
            const balance = city.balance || {};
            const hasStock = city.totalStock > 0;

            return (
              <Marker
                key={`city-${city.id}`}
                position={[city.latitude, city.longitude]}
                icon={icon}
                eventHandlers={{
                  click: () => setSelectedEntity({ entity: city, type: 'city' }),
                }}
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
                      <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-1">Запасы</div>
                      {hasStock ? (
                        <div className="space-y-1">
                          {Object.entries(BRACELET_COLORS).map(([type, info]) => {
                            const qty = balance[type] || 0;
                            const pct = city.totalStock > 0 ? Math.round((qty / city.totalStock) * 100) : 0;
                            return (
                              <div key={type} className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-gray-200" style={{ background: info.color }} />
                                <span className="text-xs text-gray-600 flex-1">{info.label}</span>
                                <span className="text-xs font-semibold text-gray-800">{qty}</span>
                                <div className="w-12 h-1 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: info.color }} />
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

          {/* ── STOCK HALOS (zoom >= threshold) ── */}
          {isZoomedIn && filteredCities
            .filter((c) => c.totalStock > 0)
            .map((city) => {
              const radius = Math.min(8 + Math.sqrt(city.totalStock) * 0.8, 30);
              const statusColor =
                city.status === 'ACTIVE' ? '#22c55e' :
                city.status === 'LOW' ? '#f59e0b' : '#ef4444';
              return (
                <CircleMarker
                  key={`halo-${city.id}`}
                  center={[city.latitude, city.longitude]}
                  radius={radius}
                  pathOptions={{
                    color: statusColor, fillColor: statusColor,
                    fillOpacity: 0.1, weight: 1.5, opacity: 0.3,
                  }}
                >
                  <Tooltip direction="top" offset={[0, -radius]} className="!bg-transparent !border-0 !shadow-none">
                    <span className="text-[10px] font-medium" style={{ color: statusColor }}>
                      {city.totalStock} шт
                    </span>
                  </Tooltip>
                </CircleMarker>
              );
            })}

          {/* ── TRANSFER ARROWS — aggregated (zoom < threshold) ── */}
          {!isZoomedIn && filteredLines.map((line, idx) => {
            const weight = Math.max(2, Math.min(8, 2 + (line.volume / maxLineVolume) * 6));
            return (
              <TransferArrow
                key={`agg-line-${idx}`}
                from={[line.fromLat, line.fromLng]}
                to={[line.toLat, line.toLng]}
                color="#7c3aed"
                weight={weight}
                opacity={0.5}
              >
                <Popup>
                  <div className="text-sm">
                    <div className="font-semibold text-violet-700">Маршрут</div>
                    <div className="text-xs text-gray-600 mt-1">
                      Объём за 90 дней: <span className="font-bold">{line.volume.toLocaleString()}</span> шт
                    </div>
                  </div>
                </Popup>
              </TransferArrow>
            );
          })}

          {/* ── TRANSFER ARROWS — individual (zoom >= threshold) ── */}
          {isZoomedIn && filteredTransfers.slice(0, 200).map((t) => {
            const color = TRANSFER_STATUS_COLORS[t.status] || '#6b7280';
            const weight = Math.max(2, Math.min(5, 1 + (t.volume / 50)));
            return (
              <TransferArrow
                key={`transfer-${t.id}`}
                from={[t.fromLat, t.fromLng]}
                to={[t.toLat, t.toLng]}
                color={color}
                weight={weight}
                opacity={0.6}
              >
                <Popup maxWidth={250}>
                  <div className="text-sm space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-gray-500">#{t.id?.slice(-6)}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded font-medium text-white" style={{ background: color }}>
                        {t.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs">
                      <span className="font-medium text-blue-600">{t.senderName}</span>
                      <span className="text-gray-400">→</span>
                      <span className="font-medium text-emerald-600">{t.receiverName}</span>
                    </div>
                    <div className="flex gap-1">
                      {(t.items || []).map((item) => (
                        <span key={item.itemType} className="text-[10px] px-1.5 py-0.5 rounded" style={{
                          background: BRACELET_COLORS[item.itemType]?.color + '20',
                          color: BRACELET_COLORS[item.itemType]?.color,
                        }}>
                          {BRACELET_COLORS[item.itemType]?.short}:{item.quantity}
                        </span>
                      ))}
                      <span className="text-xs text-gray-500 ml-1">{t.volume} шт</span>
                    </div>
                    <div className="text-[10px] text-gray-400">
                      {new Date(t.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </Popup>
              </TransferArrow>
            );
          })}
        </MapContainer>

        {/* ── SIDE PANEL ── */}
        {selectedEntity && (
          <SidePanel
            entity={selectedEntity.entity}
            type={selectedEntity.type}
            transfers={data.transfers}
            onClose={() => setSelectedEntity(null)}
          />
        )}
      </div>

      {/* Footer */}
      <div className="text-xs text-content-muted text-right">
        {filteredCities.length > 0
          ? `Городов: ${filteredCities.length} · Стран: ${data.countries.length} · Трансферов: ${filteredTransfers.length}`
          : 'Нет данных для отображения'}
      </div>
    </div>
  );
}
