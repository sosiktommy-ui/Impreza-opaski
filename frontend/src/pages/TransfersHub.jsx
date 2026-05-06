import { useSearchParams } from 'react-router-dom';
import { Send, PackageCheck, Clock, ShieldAlert } from 'lucide-react';
import Transfers from './Transfers';
import Acceptance from './Acceptance';
import PendingTransfers from './PendingTransfers';
import ProblematicTransfers from './ProblematicTransfers';
import { useBadgeStore } from '../store/useAppStore';

const TABS = [
  { key: 'outgoing',    label: 'Отправки',        Icon: Send,        badgeKey: null },
  { key: 'incoming',    label: 'Входящие',         Icon: PackageCheck, badgeKey: 'incoming',    badgeColor: 'bg-emerald-500' },
  { key: 'pending',     label: 'Незавершённые',    Icon: Clock,       badgeKey: 'pending',     badgeColor: 'bg-orange-500' },
  { key: 'problematic', label: 'Проблемы',         Icon: ShieldAlert, badgeKey: 'problematic', badgeColor: 'bg-amber-500' },
];

export default function TransfersHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'outgoing';
  const { incomingCount, pendingCount, problematicCount } = useBadgeStore();

  const getBadge = (key) => {
    if (key === 'incoming')    return incomingCount    > 0 ? incomingCount    : null;
    if (key === 'pending')     return pendingCount     > 0 ? pendingCount     : null;
    if (key === 'problematic') return problematicCount > 0 ? problematicCount : null;
    return null;
  };

  return (
    <div className="flex flex-col h-full">
      {/* ── Tab bar ── */}
      <div className="border-b border-edge bg-surface-secondary shrink-0 overflow-x-auto">
        <div className="flex items-end min-w-max px-2">
          {TABS.map(({ key, label, Icon, badgeKey, badgeColor }) => {
            const badge = getBadge(badgeKey);
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
                {badge != null && (
                  <span className={`min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-white text-[10px] font-bold px-1 leading-none ${badgeColor || 'bg-brand-600'}`}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {tab === 'outgoing'    && <Transfers />}
        {tab === 'incoming'    && <Acceptance />}
        {tab === 'pending'     && <PendingTransfers />}
        {tab === 'problematic' && <ProblematicTransfers />}
      </div>
    </div>
  );
}
