'use client';

import dynamic from 'next/dynamic';

// Dynamically import MapView to avoid SSR issues with mapbox-gl
const MapView = dynamic(() => import('@/components/map/MapView'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[calc(100vh-8rem)] bg-dark-800 rounded-2xl">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-purple" />
        <p className="text-sm text-dark-200">Загрузка карты…</p>
      </div>
    </div>
  ),
});

export default function MapPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Карта</h1>
        <p className="text-dark-200 mt-1">Инвентарь и трансферы на интерактивной карте</p>
      </div>
      <MapView className="h-[calc(100vh-12rem)] border border-dark-600 rounded-2xl" />
    </div>
  );
}
