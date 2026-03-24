import { useState, useEffect, useMemo } from 'react';
import { History as HistoryIcon, Send, PackageCheck, CalendarDays, ArrowRight, Filter, Search } from 'lucide-react';
import { transfersApi } from '../api/transfers';
import { inventoryApi } from '../api/inventory';
import { useAuthStore } from '../store/useAuthStore';
import Badge from '../components/ui/Badge';
import BraceletBadge from '../components/ui/BraceletBadge';
import Skeleton from '../components/ui/Skeleton';
import Pagination from '../components/ui/Pagination';
import { getSenderName, getReceiverName, isAdminTransfer, getTotalQuantity, getTransferCardClass } from '../utils/transferHelpers';

const TAB_FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'transfers', label: 'Отправки' },
  { key: 'expenses', label: 'Расходы' },
];

const STATUS_MAP = {
  SENT: { label: 'Отправлен', variant: 'blue' },
  ACCEPTED: { label: 'Принят', variant: 'green' },
  REJECTED: { label: 'Отклонён', variant: 'red' },
  DISCREPANCY_FOUND: { label: 'Расхождение', variant: 'yellow' },
  CANCELLED: { label: 'Отменён', variant: 'default' },
};

const BRACELET_ORDER = ['BLACK', 'WHITE', 'RED', 'BLUE'];

function TransferRow({ t }) {
  const st = STATUS_MAP[t.status] || { label: t.status, variant: 'default' };
  const senderName = getSenderName(t);
  const receiverName = getReceiverName(t);
  const isAdmin = isAdminTransfer(t);
  const totalQty = getTotalQuantity(t);

  return (
    <div className={`flex items-start gap-3 p-3 ${getTransferCardClass(t)}`}>
      <div className="w-8 h-8 rounded-full bg-sky-500/10 text-sky-400 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Send size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-content-muted font-mono">#{t.id?.slice(-6) || '—'}</span>
          <Badge variant={st.variant}>{st.label}</Badge>
          {isAdmin && <span className="text-xs px-1.5 py-0.5 bg-violet-500/20 text-violet-400 rounded font-medium">👑 ADMIN</span>}
        </div>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span className="text-sm font-medium text-blue-400">{senderName}</span>
          <ArrowRight size={12} className="text-content-muted flex-shrink-0" />
          <span className="text-sm font-medium text-emerald-400">{receiverName}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          {t.items?.map((item) => (
            <BraceletBadge key={item.itemType} type={item.itemType} count={item.quantity} />
          ))}
          <span className="text-xs text-content-muted ml-1">Итого: {totalQty} шт</span>
        </div>
        <p className="text-2xs text-content-muted mt-1">
          {new Date(t.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
          {t.notes && <span className="ml-2 text-content-secondary">· {t.notes}</span>}
        </p>
      </div>
    </div>
  );
}

function ExpenseRow({ e }) {
  return (
    <div className="flex items-start gap-3 p-3">
      <div className="w-8 h-8 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center flex-shrink-0 mt-0.5">
        <CalendarDays size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-content-primary">{e.eventName}</span>
          <span className="text-2xs text-content-muted">{e.city?.name || ''}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          {BRACELET_ORDER.map((type) => {
            const qty = e[type.toLowerCase()];
            return qty > 0 ? <BraceletBadge key={type} type={type} count={qty} /> : null;
          })}
        </div>
        <p className="text-2xs text-content-muted mt-1">
          {new Date(e.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
          {e.location && <span className="ml-2 text-content-secondary">· {e.location}</span>}
        </p>
      </div>
    </div>
  );
}

export default function History() {
  const { user } = useAuthStore();
  const [transfers, setTransfers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const perPage = 30;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [tRes, eRes] = await Promise.all([
        transfersApi.getAll({ limit: 200 }),
        inventoryApi.getExpenses({ limit: 200 }),
      ]);

      const tList = tRes.data?.data || tRes.data || [];
      setTransfers(Array.isArray(tList) ? tList : tList.data || []);

      const eList = eRes.data?.data || eRes.data || [];
      setExpenses(Array.isArray(eList) ? eList : eList.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const combined = useMemo(() => {
    let items = [];
    if (tab === 'all' || tab === 'transfers') {
      items.push(...transfers.map((t) => ({ ...t, _type: 'transfer', _date: new Date(t.createdAt) })));
    }
    if (tab === 'all' || tab === 'expenses') {
      items.push(...expenses.map((e) => ({ ...e, _type: 'expense', _date: new Date(e.createdAt) })));
    }
    
    // Apply search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((item) => {
        if (item._type === 'transfer') {
          const sender = getSenderName(item).toLowerCase();
          const receiver = getReceiverName(item).toLowerCase();
          const id = (item.id || '').toLowerCase();
          return sender.includes(q) || receiver.includes(q) || id.includes(q) || (item.notes || '').toLowerCase().includes(q);
        } else {
          // Expense
          return (item.eventName || '').toLowerCase().includes(q) || 
                 (item.city?.name || '').toLowerCase().includes(q) ||
                 (item.location || '').toLowerCase().includes(q);
        }
      });
    }
    
    items.sort((a, b) => b._date - a._date);
    return items;
  }, [transfers, expenses, tab, search]);

  const totalPages = Math.ceil(combined.length / perPage);
  const paged = combined.slice((page - 1) * perPage, page * perPage);

  useEffect(() => setPage(1), [tab]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-64" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-[var(--radius-sm)]" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-content-primary">История</h2>

      {/* Tab filter */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="flex items-center gap-1 bg-surface-card border border-edge rounded-[var(--radius-sm)] p-0.5 w-fit">
          {TAB_FILTERS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 text-sm font-medium rounded-[var(--radius-sm)] transition-colors ${
                tab === t.key
                  ? 'bg-brand-600 text-white'
                  : 'text-content-secondary hover:text-content-primary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
          <input
            type="text"
            placeholder="Поиск по отправителю или получателю..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 border border-edge bg-surface-card text-content-primary rounded-[var(--radius-sm)] text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-surface-card border border-edge rounded-[var(--radius-md)] divide-y divide-edge">
        {paged.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-content-muted">
            <HistoryIcon size={36} className="mb-2 opacity-40" />
            <p className="text-sm">Нет записей</p>
          </div>
        ) : (
          paged.map((item) =>
            item._type === 'transfer' ? (
              <TransferRow key={`t-${item.id}`} t={item} />
            ) : (
              <ExpenseRow key={`e-${item.id}`} e={item} />
            ),
          )
        )}
      </div>

      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      )}
    </div>
  );
}
