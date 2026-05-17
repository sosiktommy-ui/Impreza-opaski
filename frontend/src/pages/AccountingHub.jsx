import { useSearchParams } from 'react-router-dom';
import { Warehouse, Receipt, TrendingDown, Network } from 'lucide-react';
import Inventory from './Inventory';
import Expenses from './Expenses';
import CompanyLosses from './CompanyLosses';
import BalancesOverview from './BalancesOverview';
import { useBadgeStore } from '../store/useAppStore';
import { useAuthStore } from '../store/useAuthStore';

const BASE_TABS = [
  { key: 'balance',  label: 'Баланс',     Icon: Warehouse,   badgeKey: null },
  { key: 'overview', label: 'Общий вид', Icon: Network,     badgeKey: null, adminOnly: true },
  { key: 'expenses', label: 'Расходы',    Icon: Receipt,     badgeKey: null },
  { key: 'losses',   label: 'Потери',     Icon: TrendingDown, badgeKey: 'companyLoss', badgeColor: 'bg-red-500' },
];

const LOSS_LABEL = { ADMIN: 'Потери', OFFICE: 'Потери', COUNTRY: 'Потери страны', CITY: 'Мои потери' };

export default function AccountingHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'balance';
  const { companyLossCount } = useBadgeStore();
  const { user } = useAuthStore();

  const isAdminOrOffice = user?.role === 'ADMIN' || user?.role === 'OFFICE';
  const tabs = BASE_TABS
    .filter(t => !t.adminOnly || isAdminOrOffice)
    .map(t => t.key === 'losses' ? { ...t, label: LOSS_LABEL[user?.role] || t.label } : t);

  const getBadge = (key) => {
    if (key === 'companyLoss') return companyLossCount > 0 ? companyLossCount : null;
    return null;
  };

  return (
    <div className="flex flex-col h-full">
      {/* ── Tab bar ── */}
      <div className="border-b border-edge bg-surface-secondary shrink-0 overflow-x-auto">
        <div className="flex items-end min-w-max px-2">
          {tabs.map(({ key, label, Icon, badgeKey, badgeColor }) => {
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
        {tab === 'balance'  && <Inventory />}
        {tab === 'overview' && isAdminOrOffice && <BalancesOverview />}
        {tab === 'expenses' && <Expenses />}
        {tab === 'losses'   && <CompanyLosses />}
      </div>
    </div>
  );
}
