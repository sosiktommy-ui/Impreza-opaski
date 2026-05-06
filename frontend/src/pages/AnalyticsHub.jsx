import { useSearchParams } from 'react-router-dom';
import { BarChart3, ClockArrowUp, MapPinned } from 'lucide-react';
import Statistics from './Statistics';
import History from './History';
import Map from './Map';
import { useAuthStore } from '../store/useAuthStore';

export default function AnalyticsHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'statistics';
  const { user } = useAuthStore();
  const canViewMap = user?.role === 'ADMIN' || user?.role === 'OFFICE' || user?.role === 'COUNTRY';

  const TABS = [
    { key: 'statistics', label: 'Статистика', Icon: BarChart3 },
    { key: 'history',    label: 'История',    Icon: ClockArrowUp },
    ...(canViewMap ? [{ key: 'map', label: 'Карта', Icon: MapPinned }] : []),
  ];

  return (
    <div className="flex flex-col h-full">
      {/* ── Tab bar ── */}
      <div className="border-b border-edge bg-surface-secondary shrink-0 overflow-x-auto">
        <div className="flex items-end min-w-max px-2">
          {TABS.map(({ key, label, Icon }) => {
            const isActive = tab === key;
            return (
              <button
                key={key}
                onClick={() => setSearchParams({ tab: key })}
                className={`group flex items-center gap-2 px-4 py-3.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                  isActive
                    ? 'border-brand-500 text-brand-500'
                    : 'border-transparent text-content-secondary hover:text-content-primary hover:border-edge'
                }`}
              >
                <Icon size={15} className={`flex-shrink-0 transition-transform ${isActive ? '' : 'group-hover:scale-110'}`} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {tab === 'statistics' && <Statistics />}
        {tab === 'history'    && <History />}
        {tab === 'map'        && canViewMap && <Map />}
      </div>
    </div>
  );
}
