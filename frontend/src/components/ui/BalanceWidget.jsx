import { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { balancesApi } from '../../api/balances';
import BalanceHistoryModal from './BalanceHistoryModal';

const COLOR_DOTS = {
  black: 'bg-zinc-800 dark:bg-zinc-200',
  white: 'bg-white border border-edge',
  red: 'bg-red-500',
  blue: 'bg-blue-500',
};

const COLOR_LABEL = {
  black: 'Чёрные',
  white: 'Белые',
  red: 'Красные',
  blue: 'Синие',
};

/** Compact pill showing the user's personal bracelet balance.
 *  Only rendered for CITY / COUNTRY roles. Polls every 30s.
 */
export default function BalanceWidget() {
  const user = useAuthStore((s) => s.user);
  const role = user?.role;
  const eligible = role === 'CITY' || role === 'COUNTRY';
  const [balance, setBalance] = useState(null);
  const [error, setError] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (!eligible) return;
    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await balancesApi.getMine();
        if (!cancelled) {
          setBalance(data ?? null);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    };
    load();
    const id = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [eligible]);

  if (!eligible || !balance) return null;
  if (error) return null;

  const items = [
    { key: 'black', value: balance.black ?? 0 },
    { key: 'white', value: balance.white ?? 0 },
    { key: 'red',   value: balance.red ?? 0 },
    { key: 'blue',  value: balance.blue ?? 0 },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setHistoryOpen(true)}
        className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-[var(--radius-sm)] border border-edge bg-surface-card text-xs hover:border-brand-500 hover:bg-brand-500/5 transition-colors cursor-pointer"
        title="Ваш личный остаток опасок — нажмите для истории"
      >
        <span className="text-content-muted font-medium">Баланс:</span>
        {items.map((it) => (
          <span key={it.key} className="flex items-center gap-1" title={COLOR_LABEL[it.key]}>
            <span className={`w-2.5 h-2.5 rounded-full ${COLOR_DOTS[it.key]}`} />
            <span className="font-semibold text-content-primary tabular-nums">{it.value}</span>
          </span>
        ))}
      </button>
      <BalanceHistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Моя история баланса"
      />
    </>
  );
}
