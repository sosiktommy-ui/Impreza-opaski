'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { usersApi, inventoryApi, transfersApi } from '@/lib/api';
import type { Country, City, InventoryBalance, Transfer } from '@/lib/types';
import { formatNumber } from '@/lib/utils';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

// ──────── Aggregated inventory per entity ────────
interface EntityInventory {
  BLACK: number;
  WHITE: number;
  RED: number;
  BLUE: number;
  total: number;
}

const emptyInv = (): EntityInventory => ({ BLACK: 0, WHITE: 0, RED: 0, BLUE: 0, total: 0 });

// ──────── Popup HTML builders ────────
function cityPopup(city: City, inv: EntityInventory): string {
  const statusCls =
    city.status === 'ACTIVE'
      ? 'bg-emerald-500'
      : city.status === 'LOW'
        ? 'bg-yellow-500'
        : 'bg-red-500';

  return `
    <div style="font-family:system-ui;min-width:180px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
        <span style="width:8px;height:8px;border-radius:50%;display:inline-block"
              class="${statusCls}"></span>
        <strong style="font-size:14px;color:#e2e8f0">${city.name}</strong>
      </div>
      <div style="font-size:11px;color:#8a8aac;margin-bottom:8px">${city.country?.name || ''}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:12px">
        ${(['BLACK', 'WHITE', 'RED', 'BLUE'] as const)
          .map(
            (t) => `<div style="display:flex;align-items:center;gap:4px">
              <span style="width:8px;height:8px;border-radius:50%;background:${colorHex(t)}"></span>
              <span style="color:#b0b0cc">${t}</span>
              <span style="color:#e2e8f0;font-weight:600;margin-left:auto">${formatNumber(inv[t])}</span>
            </div>`,
          )
          .join('')}
      </div>
      <div style="margin-top:6px;padding-top:6px;border-top:1px solid #2a2a4a;font-size:12px;color:#b0b0cc">
        Всего: <strong style="color:#e2e8f0">${formatNumber(inv.total)}</strong>
      </div>
    </div>
  `;
}

function countryPopup(country: Country, inv: EntityInventory, cityCount: number): string {
  return `
    <div style="font-family:system-ui;min-width:180px">
      <strong style="font-size:15px;color:#e2e8f0">${country.name}</strong>
      <div style="font-size:11px;color:#8a8aac;margin-bottom:8px">${cityCount} городов</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:12px">
        ${(['BLACK', 'WHITE', 'RED', 'BLUE'] as const)
          .map(
            (t) => `<div style="display:flex;align-items:center;gap:4px">
              <span style="width:8px;height:8px;border-radius:50%;background:${colorHex(t)}"></span>
              <span style="color:#b0b0cc">${t}</span>
              <span style="color:#e2e8f0;font-weight:600;margin-left:auto">${formatNumber(inv[t])}</span>
            </div>`,
          )
          .join('')}
      </div>
      <div style="margin-top:6px;padding-top:6px;border-top:1px solid #2a2a4a;font-size:12px;color:#b0b0cc">
        Всего: <strong style="color:#e2e8f0">${formatNumber(inv.total)}</strong>
      </div>
    </div>
  `;
}

function colorHex(type: string): string {
  switch (type) {
    case 'BLACK': return '#374151';
    case 'WHITE': return '#d1d5db';
    case 'RED':   return '#dc2626';
    case 'BLUE':  return '#2563eb';
    default:      return '#6b7280';
  }
}



// ──────── Bezier curve for transfer arcs ────────
function arcCoordinates(
  start: [number, number],
  end: [number, number],
  steps = 50,
): [number, number][] {
  const midLng = (start[0] + end[0]) / 2;
  const midLat = (start[1] + end[1]) / 2;

  // Offset perpendicular to the line for curvature
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const dist = Math.sqrt(dx * dx + dy * dy);
  const offset = Math.min(dist * 0.2, 5); // cap curvature at 5°
  const ctrlLng = midLng - (dy / dist) * offset;
  const ctrlLat = midLat + (dx / dist) * offset;

  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lng =
      (1 - t) * (1 - t) * start[0] + 2 * (1 - t) * t * ctrlLng + t * t * end[0];
    const lat =
      (1 - t) * (1 - t) * start[1] + 2 * (1 - t) * t * ctrlLat + t * t * end[1];
    coords.push([lng, lat]);
  }
  return coords;
}

// ──────── Component ────────
interface MapViewProps {
  className?: string;
}

export default function MapView({ className }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTransfers, setShowTransfers] = useState(true);

  const loadAndRender = useCallback(async (map: mapboxgl.Map) => {
    try {
      const [countriesRes, citiesRes, invRes, transfersRes] = await Promise.all([
        usersApi.getCountries(),
        usersApi.getCities(),
        inventoryApi.getAllBalances(),
        transfersApi.getAll({ status: 'SENT' }),
      ]);

      const countries: Country[] = countriesRes.data.data || [];
      const cities: City[] = citiesRes.data.data || [];
      const balances: InventoryBalance[] = invRes.data.data || [];
      const transfers: Transfer[] =
        transfersRes.data.data?.data || transfersRes.data.data || [];

      // Aggregate inventory
      const cityInv: Record<string, EntityInventory> = {};
      const countryInv: Record<string, EntityInventory> = {};

      for (const b of balances) {
        const key = b.entityId;
        if (b.entityType === 'CITY') {
          if (!cityInv[key]) cityInv[key] = emptyInv();
          cityInv[key][b.itemType as keyof EntityInventory] =
            (cityInv[key][b.itemType as keyof EntityInventory] as number) + b.quantity;
          cityInv[key].total += b.quantity;
        } else if (b.entityType === 'COUNTRY') {
          if (!countryInv[key]) countryInv[key] = emptyInv();
          countryInv[key][b.itemType as keyof EntityInventory] =
            (countryInv[key][b.itemType as keyof EntityInventory] as number) + b.quantity;
          countryInv[key].total += b.quantity;
        }
      }

      // ── City markers ──
      const cityFeatures: GeoJSON.Feature[] = cities
        .filter((c) => c.latitude && c.longitude)
        .map((c) => ({
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: [c.longitude, c.latitude],
          },
          properties: {
            id: c.id,
            name: c.name,
            status: c.status,
            countryName: c.country?.name || '',
            total: cityInv[c.id]?.total || 0,
            popupHtml: cityPopup(c, cityInv[c.id] || emptyInv()),
          },
        }));

      if (map.getSource('cities')) {
        (map.getSource('cities') as mapboxgl.GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: cityFeatures,
        });
      } else {
        map.addSource('cities', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: cityFeatures },
        });

        // Glow effect layer
        map.addLayer({
          id: 'city-glow',
          type: 'circle',
          source: 'cities',
          paint: {
            'circle-radius': [
              'interpolate', ['linear'], ['get', 'total'],
              0, 12,
              500, 18,
              5000, 28,
              50000, 40,
            ],
            'circle-color': [
              'match', ['get', 'status'],
              'ACTIVE', '#10b981',
              'LOW', '#f59e0b',
              'INACTIVE', '#ef4444',
              '#6b7280',
            ],
            'circle-opacity': 0.15,
            'circle-blur': 1,
          },
        });

        // Main circle layer
        map.addLayer({
          id: 'city-circles',
          type: 'circle',
          source: 'cities',
          paint: {
            'circle-radius': [
              'interpolate', ['linear'], ['get', 'total'],
              0, 5,
              500, 8,
              5000, 14,
              50000, 22,
            ],
            'circle-color': [
              'match', ['get', 'status'],
              'ACTIVE', '#10b981',
              'LOW', '#f59e0b',
              'INACTIVE', '#ef4444',
              '#6b7280',
            ],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#0a0a0f',
          },
        });

        // City labels
        map.addLayer({
          id: 'city-labels',
          type: 'symbol',
          source: 'cities',
          layout: {
            'text-field': ['get', 'name'],
            'text-size': 11,
            'text-offset': [0, 1.6],
            'text-anchor': 'top',
            'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
          },
          paint: {
            'text-color': '#b0b0cc',
            'text-halo-color': '#0a0a0f',
            'text-halo-width': 1.5,
          },
        });

        // Click event
        map.on('click', 'city-circles', (e) => {
          if (!e.features?.[0]) return;
          const f = e.features[0];
          const coords = (f.geometry as GeoJSON.Point).coordinates.slice() as [number, number];
          new mapboxgl.Popup({
            closeButton: true,
            className: 'impreza-popup',
            maxWidth: '280px',
          })
            .setLngLat(coords)
            .setHTML(f.properties?.popupHtml || '')
            .addTo(map);
        });

        map.on('mouseenter', 'city-circles', () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'city-circles', () => {
          map.getCanvas().style.cursor = '';
        });
      }

      // ── Country markers (larger, shown at lower zoom) ──
      const countryFeatures: GeoJSON.Feature[] = countries
        .filter((c) => c.latitude && c.longitude)
        .map((c) => {
          const citiesInCountry = cities.filter((ci) => ci.countryId === c.id);
          return {
            type: 'Feature' as const,
            geometry: {
              type: 'Point' as const,
              coordinates: [c.longitude, c.latitude],
            },
            properties: {
              id: c.id,
              name: c.name,
              total: countryInv[c.id]?.total || 0,
              popupHtml: countryPopup(c, countryInv[c.id] || emptyInv(), citiesInCountry.length),
            },
          };
        });

      if (map.getSource('countries')) {
        (map.getSource('countries') as mapboxgl.GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: countryFeatures,
        });
      } else {
        map.addSource('countries', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: countryFeatures },
        });

        map.addLayer({
          id: 'country-circles',
          type: 'circle',
          source: 'countries',
          maxzoom: 5,
          paint: {
            'circle-radius': [
              'interpolate', ['linear'], ['get', 'total'],
              0, 10,
              10000, 18,
              100000, 30,
            ],
            'circle-color': '#7c3aed',
            'circle-opacity': 0.6,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#7c3aed',
            'circle-stroke-opacity': 0.3,
          },
        });

        map.addLayer({
          id: 'country-labels',
          type: 'symbol',
          source: 'countries',
          maxzoom: 5,
          layout: {
            'text-field': ['get', 'name'],
            'text-size': 13,
            'text-offset': [0, 2],
            'text-anchor': 'top',
            'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
          },
          paint: {
            'text-color': '#e2e8f0',
            'text-halo-color': '#0a0a0f',
            'text-halo-width': 2,
          },
        });

        map.on('click', 'country-circles', (e) => {
          if (!e.features?.[0]) return;
          const f = e.features[0];
          const coords = (f.geometry as GeoJSON.Point).coordinates.slice() as [number, number];
          new mapboxgl.Popup({
            closeButton: true,
            className: 'impreza-popup',
            maxWidth: '280px',
          })
            .setLngLat(coords)
            .setHTML(f.properties?.popupHtml || '')
            .addTo(map);
        });

        map.on('mouseenter', 'country-circles', () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'country-circles', () => {
          map.getCanvas().style.cursor = '';
        });
      }

      // ── Transfer arcs ──
      // Build a coordinate lookup — city or country
      const coordMap: Record<string, [number, number]> = {};
      for (const c of cities) {
        if (c.latitude && c.longitude) coordMap[c.id] = [c.longitude, c.latitude];
      }
      for (const c of countries) {
        if (c.latitude && c.longitude) coordMap[c.id] = [c.longitude, c.latitude];
      }

      const arcFeatures: GeoJSON.Feature[] = [];
      for (const t of transfers) {
        const fromId = t.senderCityId || t.senderCountryId;
        const toId = t.receiverCityId || t.receiverCountryId;
        if (!fromId || !toId || !coordMap[fromId] || !coordMap[toId]) continue;

        arcFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: arcCoordinates(coordMap[fromId], coordMap[toId]),
          },
          properties: {
            status: t.status,
            from: t.senderCity?.name || t.senderCountry?.name || 'Склад',
            to: t.receiverCity?.name || t.receiverCountry?.name || '',
          },
        });
      }

      if (map.getSource('transfer-arcs')) {
        (map.getSource('transfer-arcs') as mapboxgl.GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: arcFeatures,
        });
      } else {
        map.addSource('transfer-arcs', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: arcFeatures },
        });

        map.addLayer(
          {
            id: 'transfer-lines',
            type: 'line',
            source: 'transfer-arcs',
            paint: {
              'line-color': '#7c3aed',
              'line-width': 2,
              'line-opacity': 0.6,
              'line-dasharray': [2, 3],
            },
          },
          'city-glow', // place below city markers
        );

        map.addLayer(
          {
            id: 'transfer-lines-glow',
            type: 'line',
            source: 'transfer-arcs',
            paint: {
              'line-color': '#7c3aed',
              'line-width': 6,
              'line-opacity': 0.12,
              'line-blur': 4,
            },
          },
          'transfer-lines',
        );
      }

      setLoading(false);
    } catch (err) {
      console.error('Map data error:', err);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [15, 50], // Central Europe
      zoom: 4,
      attributionControl: false,
      antialias: true,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left');

    mapRef.current = map;

    map.on('load', () => {
      loadAndRender(map);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [loadAndRender]);

  // Toggle transfer layer visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const visibility = showTransfers ? 'visible' : 'none';
    if (map.getLayer('transfer-lines')) {
      map.setLayoutProperty('transfer-lines', 'visibility', visibility);
    }
    if (map.getLayer('transfer-lines-glow')) {
      map.setLayoutProperty('transfer-lines-glow', 'visibility', visibility);
    }
  }, [showTransfers]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex items-center justify-center h-full bg-dark-800 rounded-2xl border border-dark-600">
        <div className="text-center p-8">
          <p className="text-dark-200 text-sm">
            Для отображения карты установите переменную окружения
          </p>
          <code className="mt-2 inline-block px-3 py-1.5 bg-dark-700 text-accent-purple rounded-lg text-xs">
            NEXT_PUBLIC_MAPBOX_TOKEN
          </code>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className || ''}`}>
      {/* Map container */}
      <div ref={mapContainer} className="w-full h-full rounded-2xl overflow-hidden" />

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-dark-800/60 rounded-2xl backdrop-blur-sm z-10">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-purple" />
            <p className="text-sm text-dark-200">Загрузка данных карты…</p>
          </div>
        </div>
      )}

      {/* Controls overlay */}
      <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
        {/* Transfer toggle */}
        <button
          onClick={() => setShowTransfers(!showTransfers)}
          className={`px-3 py-2 rounded-xl text-xs font-medium transition-all backdrop-blur-sm ${
            showTransfers
              ? 'bg-accent-purple/80 text-white shadow-lg shadow-accent-purple/25'
              : 'bg-dark-800/80 text-dark-200 hover:bg-dark-700/80 border border-dark-500/50'
          }`}
        >
          {showTransfers ? '✦ Трансферы' : '○ Трансферы'}
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-6 left-4 z-20 px-4 py-3 bg-dark-800/90 backdrop-blur-sm rounded-xl border border-dark-600/50">
        <p className="text-[10px] uppercase tracking-wider text-dark-300 mb-2">Статус города</p>
        <div className="flex flex-col gap-1.5">
          {[
            { label: 'Активный', color: '#10b981' },
            { label: 'Мало', color: '#f59e0b' },
            { label: 'Неактивный', color: '#ef4444' },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-xs text-dark-200">{item.label}</span>
            </div>
          ))}
          {showTransfers && (
            <div className="flex items-center gap-2 mt-1 pt-1 border-t border-dark-600/50">
              <span className="w-4 h-0.5 bg-accent-purple rounded-full" />
              <span className="text-xs text-dark-200">Трансфер</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
