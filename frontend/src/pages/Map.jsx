import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  MapContainer, TileLayer, Marker, Popup, Polyline,
  CircleMarker, Tooltip, useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { feature } from 'topojson-client';
import { inventoryApi } from '../api/inventory';
import { useAuthStore } from '../store/useAuthStore';
import { useFilterStore } from '../store/useAppStore';
import { useThemeStore } from '../store/useThemeStore';
import { Maximize2, Minimize2, X, ArrowRight, MapPin, Package, TrendingUp } from 'lucide-react';
import Badge from '../components/ui/Badge';
import { ISO_NUMERIC_TO_ALPHA2 } from '../utils/countryMapping';

/* ─── Custom div-icon markers ───────────────── */
const STATUS_COLORS = {
  ACTIVE:   { bg: '#22c55e', glow: 'rgba(34,197,94,0.35)', ring: 'rgba(34,197,94,0.18)' },
  LOW:      { bg: '#f59e0b', glow: 'rgba(245,158,11,0.35)', ring: 'rgba(245,158,11,0.18)' },
  INACTIVE: { bg: '#ef4444', glow: 'rgba(239,68,68,0.35)', ring: 'rgba(239,68,68,0.18)' },
  DEFAULT:  { bg: '#6b7280', glow: 'rgba(107,114,128,0.35)', ring: 'rgba(107,114,128,0.18)' },
};

const CITY_ICON_CACHE = {};
function getCityIcon(status) {
  if (CITY_ICON_CACHE[status]) return CITY_ICON_CACHE[status];
  const col = STATUS_COLORS[status] || STATUS_COLORS.DEFAULT;
  const size = 14;
  const pulse = status === 'ACTIVE';
  CITY_ICON_CACHE[status] = L.divIcon({
    className: '',
    html: `<div style="position:relative;width:${size}px;height:${size}px;">
      ${pulse ? `<div class="map-pulse" style="position:absolute;top:50%;left:50%;width:${size * 3}px;height:${size * 3}px;border-radius:50%;background:${col.ring};"></div>` : ''}
      <div style="width:${size}px;height:${size}px;background:${col.bg};border-radius:50%;border:2.5px solid white;box-shadow:0 0 10px ${col.glow},0 2px 6px rgba(0,0,0,0.2);position:relative;z-index:2;"></div>
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 4],
  });
  return CITY_ICON_CACHE[status];
}

const COUNTRY_ICON = L.divIcon({
  className: '',
  html: `<div style="width:32px;height:32px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:50%;border:3px solid white;box-shadow:0 0 16px rgba(99,102,241,0.4),0 3px 8px rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
  </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -20],
});

const STATUS_META = {
  ACTIVE:   { label: 'Активный', dot: 'bg-emerald-500', text: 'text-emerald-500', color: '#22c55e' },
  LOW:      { label: 'Мало',     dot: 'bg-amber-500',   text: 'text-amber-500',   color: '#f59e0b' },
  INACTIVE: { label: 'Нет браслетов', dot: 'bg-red-500', text: 'text-red-500', color: '#ef4444' },
};

const BRACELET_COLORS = {
  BLACK: { label: 'Чёрные', color: '#1f2937', short: 'Ч' },
  WHITE: { label: 'Белые',  color: '#9ca3af', short: 'Б' },
  RED:   { label: 'Красные', color: '#ef4444', short: 'К' },
  BLUE:  { label: 'Синие',   color: '#3b82f6', short: 'С' },
};

const TRANSFER_STATUS_COLORS = {
  SENT: '#8b5cf6',
  ACCEPTED: '#22c55e',
  REJECTED: '#ef4444',
  DISCREPANCY_FOUND: '#f59e0b',
  CANCELLED: '#6b7280',
};

/* ─── Tile layers ────────────────────────────── */
const TILE_LIGHT = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const TILE_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTR = '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>';

const ZOOM_THRESHOLD = 6;

/* ─── Color helpers ──────────────────────────── */
function getCountryFill(stock) {
  if (stock === 0) return '#ef444450';
  if (stock < 100) return '#f59e0b40';
  if (stock < 500) return '#eab30835';
  if (stock < 1000) return '#84cc1630';
  return '#22c55e30';
}
function getCountryStroke(stock) {
  if (stock === 0) return '#ef4444';
  if (stock < 100) return '#f59e0b';
  if (stock < 500) return '#eab308';
  if (stock < 1000) return '#84cc16';
  return '#22c55e';
}

/* ─── FlyTo helper ───────────────────────────── */
function FlyToLocation({ position, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.flyTo(position, zoom || 8, { duration: 1.5, easeLinearity: 0.25 });
  }, [position, zoom, map]);
  return null;
}

/* ─── Dynamic tiles ──────────────────────────── */
function DynamicTiles({ dark }) {
  const map = useMap();
  useEffect(() => { setTimeout(() => map.invalidateSize(), 50); }, [dark, map]);
  return <TileLayer attribution={TILE_ATTR} url={dark ? TILE_DARK : TILE_LIGHT} />;
}

/* ─── Robust Zoom Controller ─────────────────── */
function MapController({ onZoomChange }) {
  const map = useMap();
  useEffect(() => {
    const handler = () => onZoomChange(map.getZoom());
    map.on('zoomend', handler);
    handler();
    return () => { map.off('zoomend', handler); };
  }, [map, onZoomChange]);
  return null;
}

/* ─── Imperative GeoJSON Country Boundaries ──── */
function CountryBoundaries({ geoJsonData, countryByCode, isZoomedIn, onCountryClick }) {
  const map = useMap();
  const layerRef = useRef(null);
  const isZoomedInRef = useRef(isZoomedIn);
  isZoomedInRef.current = isZoomedIn;

  const styleFn = useCallback((feat) => {
    const numId = String(feat.id).padStart(3, '0');
    const a2 = ISO_NUMERIC_TO_ALPHA2[numId];
    const country = a2 ? countryByCode[a2] : null;
    const stock = country?.totalStock || 0;
    const zi = isZoomedInRef.current;
    return {
      fillColor: getCountryFill(stock),
      color: getCountryStroke(stock),
      weight: zi ? 0.8 : 1.5,
      fillOpacity: zi ? 0.03 : 0.35,
      opacity: zi ? 0.2 : 0.7,
    };
  }, [countryByCode]);

  // Create layer
  useEffect(() => {
    if (!geoJsonData) return;
    if (layerRef.current) map.removeLayer(layerRef.current);

    const layer = L.geoJSON(geoJsonData, {
      style: styleFn,
      onEachFeature: (feat, lyr) => {
        const numId = String(feat.id).padStart(3, '0');
        const a2 = ISO_NUMERIC_TO_ALPHA2[numId];
        const country = a2 ? countryByCode[a2] : null;
        if (country) {
          lyr.bindTooltip(
            `<strong>${country.name}</strong><br/>${country.totalStock || 0} шт`,
            { sticky: true, className: 'map-custom-tooltip' }
          );
          lyr.on({
            mouseover: (e) => {
              const zi = isZoomedInRef.current;
              e.target.setStyle({ weight: 2.5, fillOpacity: zi ? 0.08 : 0.5, opacity: 1 });
              e.target.bringToFront();
            },
            mouseout: (e) => { layerRef.current?.resetStyle(e.target); },
            click: () => onCountryClick(country),
          });
        }
      },
    });
    layer.addTo(map);
    layerRef.current = layer;
    return () => { if (layerRef.current) map.removeLayer(layerRef.current); };
  }, [geoJsonData, map, countryByCode, onCountryClick, styleFn]);

  // Update styles when zoom state changes
  useEffect(() => {
    if (layerRef.current) layerRef.current.setStyle(styleFn);
  }, [isZoomedIn, styleFn]);

  return null;
}

/* ─── Transfer Arrow ─────────────────────────── */
function TransferArrow({ from, to, color, weight, opacity, children }) {
  const midLat = (from[0] + to[0]) / 2;
  const midLng = (from[1] + to[1]) / 2;
  const dx = to[1] - from[1];
  const dy = to[0] - from[0];
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const offsetLat = midLat + (dx / len) * 0.12;
  const offsetLng = midLng - (dy / len) * 0.12;
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

/* ─── Side Panel — glassmorphism ─────────────── */
function SidePanel({ entity, type, transfers, onClose }) {
  if (!entity) return null;
  const balance = entity.balance || {};
  const total = type === 'country'
    ? entity.totalStock
    : Object.values(balance).reduce((a, b) => a + b, 0);

  const entityTransfers = (transfers || []).filter((t) => {
    if (type === 'country') return t.senderCountryId === entity.id || t.receiverCountryId === entity.id;
    return t.senderName === entity.name || t.receiverName === entity.name;
  }).slice(0, 15);

  return (
    <div className="absolute top-0 right-0 h-full w-80 z-[1000] map-side-panel">
      <div className="h-full bg-white/80 dark:bg-[#1a1a24]/90 backdrop-blur-xl border-l border-white/20 dark:border-white/5 overflow-y-auto">
        <div className="p-5 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-bold text-content-primary">{entity.name}</h3>
              <p className="text-xs text-content-muted mt-0.5">
                {type === 'country'
                  ? `${entity.code?.toUpperCase()} · ${entity.cityCount || 0} городов`
                  : entity.countryName || ''}
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
              <X size={16} className="text-content-muted" />
            </button>
          </div>

          {/* Status badge */}
          {type === 'city' && entity.status && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
              style={{
                background: (STATUS_META[entity.status]?.color || '#6b7280') + '15',
                color: STATUS_META[entity.status]?.color || '#6b7280',
              }}>
              <span className="w-2 h-2 rounded-full" style={{ background: STATUS_META[entity.status]?.color }} />
              {STATUS_META[entity.status]?.label || entity.status}
            </div>
          )}

          {/* Balance card */}
          <div className="rounded-xl bg-black/[0.03] dark:bg-white/[0.03] p-4 space-y-3">
            <div className="text-[10px] text-content-muted font-semibold uppercase tracking-widest">
              {type === 'country' ? 'Баланс' : 'Запасы'}
            </div>
            {Object.entries(BRACELET_COLORS).map(([itemType, info]) => {
              const qty = type === 'country'
                ? (balance[itemType] || 0) + (entity.cityBalance?.[itemType] || 0)
                : (balance[itemType] || 0);
              const pct = total > 0 ? Math.round((qty / total) * 100) : 0;
              return (
                <div key={itemType} className="flex items-center gap-2.5">
                  <span className="w-3 h-3 rounded-full flex-shrink-0 ring-2 ring-white dark:ring-[#1a1a24]" style={{ background: info.color }} />
                  <span className="text-xs text-content-secondary flex-1">{info.label}</span>
                  <span className="text-xs font-bold text-content-primary tabular-nums">{qty}</span>
                  <div className="w-14 h-1.5 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: info.color }} />
                  </div>
                </div>
              );
            })}
            <div className="flex justify-between pt-2 border-t border-black/5 dark:border-white/5">
              <span className="text-xs text-content-muted">Итого</span>
              <span className="text-sm font-bold text-content-primary tabular-nums">
                {type === 'country'
                  ? Object.keys(BRACELET_COLORS).reduce((s, t) => s + (balance[t] || 0) + (entity.cityBalance?.[t] || 0), 0)
                  : total}
              </span>
            </div>
          </div>

          {/* Country detail */}
          {type === 'country' && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-black/[0.03] dark:bg-white/[0.03] p-3 text-center">
                <div className="text-lg font-bold text-content-primary">
                  {Object.values(balance).reduce((a, b) => a + b, 0)}
                </div>
                <div className="text-content-muted mt-0.5">На балансе</div>
              </div>
              <div className="rounded-lg bg-black/[0.03] dark:bg-white/[0.03] p-3 text-center">
                <div className="text-lg font-bold text-content-primary">
                  {Object.values(entity.cityBalance || {}).reduce((a, b) => a + b, 0)}
                </div>
                <div className="text-content-muted mt-0.5">В городах</div>
              </div>
            </div>
          )}

          {/* Recent transfers */}
          <div>
            <div className="text-[10px] text-content-muted font-semibold uppercase tracking-widest mb-3">
              Трансферы ({entityTransfers.length})
            </div>
            {entityTransfers.length === 0 ? (
              <p className="text-xs text-content-muted py-4 text-center">Нет трансферов</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {entityTransfers.map((t) => {
                  const isOutgoing = t.senderName === entity.name || t.senderCountryId === entity.id;
                  const statusColor = TRANSFER_STATUS_COLORS[t.status] || '#6b7280';
                  return (
                    <div key={t.id} className="rounded-lg bg-black/[0.02] dark:bg-white/[0.02] p-2.5 space-y-1.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusColor }} />
                        <span className="font-mono text-[10px] text-content-muted">#{t.id?.slice(-6)}</span>
                        <Badge status={t.status} />
                      </div>
                      <div className="flex items-center gap-1 text-xs text-content-secondary">
                        <span className={isOutgoing ? 'text-blue-500' : ''}>{t.senderName}</span>
                        <ArrowRight size={10} className="text-content-muted flex-shrink-0" />
                        <span className={!isOutgoing ? 'text-emerald-500' : ''}>{t.receiverName}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {(t.items || []).map((item) => (
                          <span key={item.itemType} className="text-[10px] px-1.5 py-0.5 rounded-md font-medium" style={{
                            background: (BRACELET_COLORS[item.itemType]?.color || '#6b7280') + '15',
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
  const [selectedEntity, setSelectedEntity] = useState(null);
  const mapWrapRef = useRef(null);

  const isZoomedIn = zoomLevel >= ZOOM_THRESHOLD;
  const handleZoomChange = useCallback((z) => setZoomLevel(z), []);

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

  useEffect(() => { loadData(); }, []);
  useEffect(() => { loadGeoJson(); }, []);

  useEffect(() => {
    setCountryFilter(globalCountryId || 'all');
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
      console.error('Map data error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadGeoJson = async () => {
    try {
      const resp = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
      const topology = await resp.json();
      const world = feature(topology, topology.objects.countries);
      const ourCodes = new Set(Object.keys(ISO_NUMERIC_TO_ALPHA2));
      setGeoJsonData({
        ...world,
        features: world.features.filter((f) => ourCodes.has(String(f.id).padStart(3, '0'))),
      });
    } catch (err) {
      console.error('GeoJSON load error:', err);
    }
  };

  // ── Filters
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
      filteredCities.some((c) =>
        (Math.abs(c.latitude - line.fromLat) < 0.01 && Math.abs(c.longitude - line.fromLng) < 0.01) ||
        (Math.abs(c.latitude - line.toLat) < 0.01 && Math.abs(c.longitude - line.toLng) < 0.01)
      )
    );
  }, [data.transferLines, filteredCities, countryFilter]);

  // ── Stats
  const statusCounts = useMemo(() => {
    const c = { ACTIVE: 0, LOW: 0, INACTIVE: 0 };
    filteredCities.forEach((city) => { if (c[city.status] !== undefined) c[city.status]++; });
    return c;
  }, [filteredCities]);

  const totalStock = useMemo(() => {
    const t = {};
    filteredCities.forEach((c) => {
      Object.entries(c.balance || {}).forEach(([type, qty]) => { t[type] = (t[type] || 0) + qty; });
    });
    return t;
  }, [filteredCities]);

  const grandTotal = useMemo(() => Object.values(totalStock).reduce((a, b) => a + b, 0), [totalStock]);
  const maxLineVolume = useMemo(() => Math.max(1, ...filteredLines.map((l) => l.volume)), [filteredLines]);

  const countryByCode = useMemo(() => {
    const m = {};
    data.countries.forEach((c) => { if (c.code) m[c.code.toLowerCase()] = c; });
    return m;
  }, [data.countries]);

  const handleCountryClick = useCallback((country) => {
    setSelectedEntity({ entity: country, type: 'country' });
    setFlyToPos([country.latitude, country.longitude]);
    setFlyToZoom(7);
  }, []);

  const canFilterCountry = user?.role === 'ADMIN' || user?.role === 'OFFICE';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="relative">
          <div className="w-12 h-12 rounded-full border-4 border-brand-100 dark:border-brand-900" />
          <div className="absolute top-0 left-0 w-12 h-12 rounded-full border-4 border-transparent border-t-brand-600 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-content-primary">Карта</h2>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400">
            <span className={`w-1.5 h-1.5 rounded-full transition-colors ${isZoomedIn ? 'bg-emerald-500' : 'bg-brand-500'}`} />
            {isZoomedIn ? 'Города' : 'Страны'} · z{Math.round(zoomLevel)}
          </div>
        </div>
        <button
          onClick={() => setShowPanel(!showPanel)}
          className="text-xs px-3 py-1.5 rounded-lg bg-black/5 dark:bg-white/5 text-content-secondary hover:bg-black/10 dark:hover:bg-white/10 transition-all"
        >
          {showPanel ? 'Скрыть' : 'Панель'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
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
            className="px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-white/5 border border-black/10 dark:border-white/10 text-content-secondary focus:ring-2 focus:ring-brand-500/30 focus:outline-none transition-all"
          >
            <option value="all">Все страны ({data.cities.length})</option>
            {data.countries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.cityCount || 0} · {c.totalStock || 0} шт)
              </option>
            ))}
          </select>
        )}

        {[
          { key: 'all', label: `Все (${filteredCities.length})`, color: '#6b7280' },
          { key: 'ACTIVE', label: `Активные (${statusCounts.ACTIVE})`, color: '#22c55e' },
          { key: 'LOW', label: `Мало (${statusCounts.LOW})`, color: '#f59e0b' },
          { key: 'INACTIVE', label: `Пустые (${statusCounts.INACTIVE})`, color: '#ef4444' },
        ].map(({ key, label, color }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
              statusFilter === key
                ? 'text-white shadow-md'
                : 'bg-white dark:bg-white/5 text-content-secondary hover:bg-black/5 dark:hover:bg-white/10 border border-black/5 dark:border-white/10'
            }`}
            style={statusFilter === key ? { background: color, boxShadow: `0 4px 12px ${color}40` } : {}}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusFilter === key ? 'white' : color }} />
            {label}
          </button>
        ))}
      </div>

      {/* Stats Panel */}
      {showPanel && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-slideInUp">
          {[
            { icon: MapPin, value: filteredCities.length, label: 'Городов', color: '#6366f1' },
            { icon: Package, value: grandTotal.toLocaleString(), label: 'Браслетов', color: '#22c55e' },
            { icon: TrendingUp, value: filteredTransfers.length, label: 'Трансферов', color: '#8b5cf6' },
          ].map(({ icon: Icon, value, label, color }, i) => (
            <div key={i} className="relative overflow-hidden rounded-xl bg-white dark:bg-white/[0.03] border border-black/5 dark:border-white/5 p-4 transition-all hover:shadow-md group">
              <div className="absolute top-0 right-0 w-16 h-16 rounded-full opacity-[0.04] -mr-4 -mt-4 transition-transform group-hover:scale-150" style={{ background: color }} />
              <Icon size={14} className="mb-2" style={{ color }} />
              <div className="text-2xl font-bold text-content-primary tabular-nums">{value}</div>
              <div className="text-[11px] text-content-muted mt-0.5">{label}</div>
            </div>
          ))}
          <div className="relative overflow-hidden rounded-xl bg-white dark:bg-white/[0.03] border border-black/5 dark:border-white/5 p-4">
            <div className="text-[11px] text-content-muted mb-2">По цветам</div>
            <div className="flex flex-wrap gap-x-3 gap-y-1.5">
              {Object.entries(totalStock)
                .sort(([, a], [, b]) => b - a)
                .map(([type, qty]) => {
                  const info = BRACELET_COLORS[type] || { label: type, color: '#6b7280' };
                  return (
                    <div key={type} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/10" style={{ background: info.color }} />
                      <span className="text-xs font-semibold text-content-primary tabular-nums">{qty}</span>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-4 text-[11px] text-content-muted flex-wrap px-1">
        {[
          { c: '#22c55e', l: 'Акт.' },
          { c: '#f59e0b', l: 'Мало' },
          { c: '#ef4444', l: 'Пусто' },
        ].map(({ c, l }) => (
          <span key={l} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} /> {l}
          </span>
        ))}
        <span className="text-content-muted/30">|</span>
        {Object.entries(TRANSFER_STATUS_COLORS).slice(0, 4).map(([status, color]) => (
          <span key={status} className="flex items-center gap-1.5">
            <span className="w-5 h-0 border-t-2" style={{ borderColor: color }} />
            <span>{status === 'DISCREPANCY_FOUND' ? 'DISC' : status}</span>
          </span>
        ))}
      </div>

      {/* Map */}
      <div
        ref={mapWrapRef}
        className={`relative rounded-2xl overflow-hidden border border-black/5 dark:border-white/5 shadow-lg ${
          fullscreen ? 'h-screen w-screen' : 'h-[calc(100vh-260px)] min-h-[500px]'
        }`}
      >
        {/* Fullscreen toggle */}
        <button
          onClick={toggleFullscreen}
          className="absolute top-3 right-3 z-[999] p-2.5 rounded-xl bg-white/80 dark:bg-[#1a1a24]/80 backdrop-blur-md border border-black/5 dark:border-white/10 text-content-secondary hover:bg-white dark:hover:bg-[#1a1a24] shadow-lg transition-all"
          title={fullscreen ? 'Выйти' : 'Полноэкранный'}
        >
          {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>

        {/* Zoom indicator overlay */}
        <div className="absolute bottom-4 left-4 z-[999] px-3 py-1.5 rounded-full text-[11px] font-medium bg-white/80 dark:bg-[#1a1a24]/80 backdrop-blur-md border border-black/5 dark:border-white/10 text-content-secondary shadow-lg flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full transition-colors ${isZoomedIn ? 'bg-emerald-500' : 'bg-indigo-500'}`} />
          {isZoomedIn ? `Города · ${filteredCities.length}` : `Страны · ${data.countries.length}`}
        </div>

        <MapContainer
          center={[48.5, 15.0]}
          zoom={5}
          className="h-full w-full"
          scrollWheelZoom={true}
          zoomSnap={0.5}
          zoomDelta={0.5}
        >
          <DynamicTiles dark={darkMode} />
          <FlyToLocation position={flyToPos} zoom={flyToZoom} />
          <MapController onZoomChange={handleZoomChange} />

          {/* Country boundaries — imperative GeoJSON */}
          <CountryBoundaries
            geoJsonData={geoJsonData}
            countryByCode={countryByCode}
            isZoomedIn={isZoomedIn}
            onCountryClick={handleCountryClick}
          />

          {/* COUNTRY MARKERS (zoomed out) */}
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
                  },
                }}
              >
                <Tooltip direction="top" offset={[0, -20]} permanent={zoomLevel >= 4} className="map-tooltip-country">
                  <span className="text-xs font-bold">{c.name}: {c.totalStock || 0}</span>
                </Tooltip>
              </Marker>
            ))}

          {/* CITY MARKERS (zoomed in) */}
          {isZoomedIn && filteredCities.map((city) => {
            const icon = getCityIcon(city.status);
            const meta = STATUS_META[city.status] || { label: city.status, dot: 'bg-gray-400', text: 'text-gray-500', color: '#6b7280' };
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
                <Popup maxWidth={260} minWidth={200} className="map-popup-modern">
                  <div className="text-sm space-y-2.5 p-1">
                    <div>
                      <div className="font-bold text-base flex items-center gap-2">
                        {city.name}
                        <span className="w-2 h-2 rounded-full" style={{ background: meta.color }} />
                      </div>
                      <div className="text-gray-400 text-xs mt-0.5">
                        {city.countryName} · <span style={{ color: meta.color }}>{meta.label}</span>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                      <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest mb-1.5">Запасы</div>
                      {hasStock ? (
                        <div className="space-y-1.5">
                          {Object.entries(BRACELET_COLORS).map(([type, info]) => {
                            const qty = balance[type] || 0;
                            const pct = city.totalStock > 0 ? Math.round((qty / city.totalStock) * 100) : 0;
                            return (
                              <div key={type} className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: info.color }} />
                                <span className="text-xs text-gray-500 flex-1">{info.label}</span>
                                <span className="text-xs font-bold tabular-nums">{qty}</span>
                                <div className="w-14 h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: info.color }} />
                                </div>
                              </div>
                            );
                          })}
                          <div className="flex justify-between pt-1.5 border-t border-gray-50 dark:border-gray-700">
                            <span className="text-xs text-gray-400">Итого</span>
                            <span className="text-xs font-bold">{city.totalStock}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-red-400 font-medium">Нет запасов</div>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* STOCK HALOS (zoomed in) */}
          {isZoomedIn && filteredCities
            .filter((c) => c.totalStock > 0)
            .map((city) => {
              const radius = Math.min(10 + Math.sqrt(city.totalStock) * 0.9, 35);
              const col = STATUS_COLORS[city.status] || STATUS_COLORS.DEFAULT;
              return (
                <CircleMarker
                  key={`halo-${city.id}`}
                  center={[city.latitude, city.longitude]}
                  radius={radius}
                  pathOptions={{
                    color: col.bg, fillColor: col.bg,
                    fillOpacity: 0.08, weight: 1, opacity: 0.2,
                  }}
                >
                  <Tooltip direction="top" offset={[0, -radius]} className="map-stock-tooltip">
                    <span className="text-[10px] font-semibold" style={{ color: col.bg }}>
                      {city.totalStock} шт
                    </span>
                  </Tooltip>
                </CircleMarker>
              );
            })}

          {/* TRANSFER ARROWS — aggregated (zoomed out) */}
          {!isZoomedIn && filteredLines.map((line, idx) => {
            const weight = Math.max(2, Math.min(7, 2 + (line.volume / maxLineVolume) * 5));
            return (
              <TransferArrow
                key={`agg-${idx}`}
                from={[line.fromLat, line.fromLng]}
                to={[line.toLat, line.toLng]}
                color="#7c3aed"
                weight={weight}
                opacity={0.45}
              >
                <Popup>
                  <div className="text-sm p-1">
                    <div className="font-semibold text-violet-600">Маршрут</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Объём (90д): <span className="font-bold text-gray-800">{line.volume.toLocaleString()}</span> шт
                    </div>
                  </div>
                </Popup>
              </TransferArrow>
            );
          })}

          {/* TRANSFER ARROWS — individual (zoomed in) */}
          {isZoomedIn && filteredTransfers.slice(0, 200).map((t) => {
            const color = TRANSFER_STATUS_COLORS[t.status] || '#6b7280';
            const weight = Math.max(2, Math.min(5, 1 + (t.volume / 50)));
            return (
              <TransferArrow
                key={`t-${t.id}`}
                from={[t.fromLat, t.fromLng]}
                to={[t.toLat, t.toLng]}
                color={color}
                weight={weight}
                opacity={0.55}
              >
                <Popup maxWidth={240}>
                  <div className="text-sm space-y-1.5 p-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-gray-400">#{t.id?.slice(-6)}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold text-white" style={{ background: color }}>
                        {t.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs">
                      <span className="font-medium text-blue-500">{t.senderName}</span>
                      <span className="text-gray-300">→</span>
                      <span className="font-medium text-emerald-500">{t.receiverName}</span>
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {(t.items || []).map((item) => (
                        <span key={item.itemType} className="text-[10px] px-1.5 py-0.5 rounded-md font-medium" style={{
                          background: (BRACELET_COLORS[item.itemType]?.color || '#6b7280') + '15',
                          color: BRACELET_COLORS[item.itemType]?.color || '#6b7280',
                        }}>
                          {BRACELET_COLORS[item.itemType]?.short}:{item.quantity}
                        </span>
                      ))}
                      <span className="text-[11px] text-gray-400 ml-0.5">{t.volume} шт</span>
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

        {/* Side Panel */}
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
      <div className="text-[11px] text-content-muted text-right tabular-nums">
        {filteredCities.length > 0
          ? `${filteredCities.length} городов · ${data.countries.length} стран · ${filteredTransfers.length} трансферов`
          : 'Нет данных'}
      </div>
    </div>
  );
}
