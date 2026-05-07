import { useState, useEffect, useMemo } from 'react';
import { History as HistoryIcon, Send, PackageCheck, CalendarDays, ArrowRight, Filter, Search, ShieldCheck, Home, ArrowLeftRight, Globe } from 'lucide-react';
import { transfersApi } from '../api/transfers';
import { inventoryApi } from '../api/inventory';
import { auditApi } from '../api/audit';
import { useAuthStore } from '../store/useAuthStore';
import { useFilterStore } from '../store/useAppStore';
import Badge from '../components/ui/Badge';
import BraceletBadge from '../components/ui/BraceletBadge';
import Skeleton from '../components/ui/Skeleton';
import Pagination from '../components/ui/Pagination';
import { getSenderName, getReceiverName, isAdminTransfer, getTotalQuantity, getTransferCardClass } from '../utils/transferHelpers';

const EXPENSE_TYPE_META = {
  INTERNAL: { label: 'Внутренний', className: 'bg-emerald-500/10 text-emerald-500', Icon: Home },
  EXTERNAL: { label: 'Внешний', className: 'bg-sky-500/10 text-sky-500', Icon: ArrowLeftRight },
  THIRD:    { label: 'Сторонний', className: 'bg-gray-500/10 text-gray-400', Icon: Globe },
};

const ROLE_LABELS = { ADMIN: 'Админ', OFFICE: 'Офис', COUNTRY: 'Страна', CITY: 'Город' };

const TAB_FILTERS_BASE = [
  { key: 'all', label: 'Все' },
  { key: 'transfers', label: 'Отправки' },
  { key: 'expenses', label: 'Расходы' },
  { key: 'problematic', label: 'Проблемные' },
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
        <p className="text-2xs text-content-muted mt-1 flex items-center gap-2 flex-wrap">
          <span>{new Date(t.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          {t.notes && <span className="text-content-secondary">· {t.notes}</span>}
          {t.createdByUser && (
            <span className="text-violet-400">· Создал: <strong>{t.createdByUser.displayName || t.createdByUser.username}</strong> ({ROLE_LABELS[t.createdByUser.role] || t.createdByUser.role})</span>
          )}
          {t.acceptanceRecords?.length > 0 && t.acceptanceRecords[0]?.acceptedBy && (
            <span className="text-emerald-400">· Принял: <strong>{t.acceptanceRecords[0].acceptedBy.displayName || t.acceptanceRecords[0].acceptedBy.username}</strong></span>
          )}
        </p>
      </div>
    </div>
  );
}

function ExpenseRow({ e }) {
  const typeMeta = EXPENSE_TYPE_META[e.type] ?? EXPENSE_TYPE_META.INTERNAL;
  const TypeIcon = typeMeta.Icon;
  const actor = e.actorUser;
  return (
    <div className="flex items-start gap-3 p-3">
      <div className="w-8 h-8 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center flex-shrink-0 mt-0.5">
        <CalendarDays size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-content-primary">{e.eventName}</span>
          <span className="text-2xs text-content-muted">{e.city?.name || ''}</span>
          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${typeMeta.className}`}>
            <TypeIcon size={9} />{typeMeta.label}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          {BRACELET_ORDER.map((type) => {
            const qty = e[type.toLowerCase()];
            return qty > 0 ? <BraceletBadge key={type} type={type} count={qty} /> : null;
          })}
        </div>
        <p className="text-2xs text-content-muted mt-1 flex items-center gap-2 flex-wrap">
          <span>{new Date(e.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          {e.location && <span className="text-content-secondary">· {e.location}</span>}
          {actor && (
            <span className="text-violet-400">· Добавил: <strong>{actor.displayName || actor.username}</strong> ({ROLE_LABELS[actor.role] || actor.role})</span>
          )}
        </p>
      </div>
    </div>
  );
}

const AUDIT_ACTION_LABELS = {
  TRANSFER_SENT: 'Отправка',
  TRANSFER_ACCEPTED: 'Приёмка',
  TRANSFER_REJECTED: 'Отклонение',
  TRANSFER_CANCELLED: 'Отмена',
  TRANSFER_EDITED: 'Редактирование',
  DISCREPANCY_FOUND: 'Расхождение',
  DISCREPANCY_RESOLVED: 'Решение расхождения',
  INVENTORY_ADJUSTED: 'Корректировка склада',
  USER_CREATED: 'Создание пользователя',
  USER_UPDATED: 'Обновление пользователя',
  USER_DELETED: 'Удаление пользователя',
  USER_LOGIN: 'Вход',
  USER_LOGOUT: 'Выход',
  PASSWORD_CHANGED: 'Смена пароля',
  EXPENSE_CREATED: 'Расход создан',
  EXPENSE_DELETED: 'Расход удалён',
  COMPANY_LOSS_CREATED: 'Потеря компании',
  SHORTAGE_CREATED: 'Недостача',
  WAREHOUSE_CREATED: 'Создание на складе',
};

function AuditRow({ log }) {
  const label = AUDIT_ACTION_LABELS[log.action] || log.action;
  const meta = log.metadata || {};
  return (
    <div className="flex items-start gap-3 p-3">
      <div className="w-8 h-8 rounded-full bg-violet-500/10 text-violet-400 flex items-center justify-center flex-shrink-0 mt-0.5">
        <ShieldCheck size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-content-primary">{label}</span>
          <span className="text-2xs text-content-muted font-mono">#{log.entityId?.slice(-6) || '—'}</span>
        </div>
        <p className="text-2xs text-content-muted mt-0.5">
          Актор: {log.actor?.displayName || log.actor?.username || log.actorId?.slice(-6) || '—'}
          {log.actor?.role && <span className="ml-1 opacity-70">({ROLE_LABELS[log.actor.role] || log.actor.role})</span>}
          {log.entityType && <span className="ml-2">· {log.entityType}</span>}
        </p>
        {meta.notes && <p className="text-2xs text-content-secondary mt-0.5">"{meta.notes}"</p>}
        {meta.oldItems && meta.newItems && (
          <p className="text-2xs text-content-secondary mt-0.5">
            До: Ч:{meta.oldItems.BLACK || 0} Б:{meta.oldItems.WHITE || 0} К:{meta.oldItems.RED || 0} С:{meta.oldItems.BLUE || 0}
            {' → '}
            После: Ч:{meta.newItems.BLACK || 0} Б:{meta.newItems.WHITE || 0} К:{meta.newItems.RED || 0} С:{meta.newItems.BLUE || 0}
          </p>
        )}
        <p className="text-2xs text-content-muted mt-1">
          {new Date(log.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}

export default function History() {
  const { user } = useAuthStore();
  const { countryId, cityId, eventId } = useFilterStore();
  const [transfers, setTransfers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotalPages, setAuditTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const perPage = 30;

  const canSeeAudit = user?.role === 'ADMIN' || user?.role === 'OFFICE';
  const TAB_FILTERS = canSeeAudit
    ? [...TAB_FILTERS_BASE, { key: 'audit', label: 'Журнал' }]
    : TAB_FILTERS_BASE;

  useEffect(() => {
    loadData();
  }, [countryId, cityId, eventId]);

  useEffect(() => {
    if (tab === 'audit' && canSeeAudit) loadAudit(auditPage);
  }, [tab, auditPage]);

  const loadAudit = async (p = 1) => {
    try {
      const { data } = await auditApi.getAll({ page: p, limit: perPage });
      const payload = data?.data || data;
      setAuditLogs(Array.isArray(payload) ? payload : payload.data || []);
      setAuditTotalPages(data?.meta?.totalPages || 1);
    } catch (err) {
      console.error('Failed to load audit logs', err);
    }
  };

  const loadData = async () => {
    try {
      const filterParams = {};
      if (countryId) filterParams.countryId = countryId;
      if (cityId) filterParams.cityId = cityId;
      if (eventId) filterParams.eventId = eventId;

      const [tRes, eRes] = await Promise.all([
        transfersApi.getAll({ limit: 200, ...filterParams }),
        inventoryApi.getExpenses({ limit: 200, ...filterParams }),
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
    if (tab === 'problematic') {
      // Show both unresolved (DISCREPANCY_FOUND) and resolved problematic transfers
      // Resolved = ACCEPTED status but had discrepancy in acceptanceRecords
      const isProblematic = (t) => {
        if (t.status === 'DISCREPANCY_FOUND') return true;
        // Check if ACCEPTED transfer had discrepancy (resolved)
        if (t.status === 'ACCEPTED' && t.acceptanceRecords?.length > 0) {
          return t.acceptanceRecords.some((r) => r.sentQuantity !== r.receivedQuantity);
        }
        return false;
      };
      items.push(...transfers
        .filter(isProblematic)
        .map((t) => ({ ...t, _type: 'transfer', _date: new Date(t.createdAt) })));
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

      {/* Timeline / Audit */}
      {tab === 'audit' ? (
        <>
          <div className="bg-surface-card border border-edge rounded-[var(--radius-md)] divide-y divide-edge">
            {auditLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-content-muted">
                <ShieldCheck size={36} className="mb-2 opacity-40" />
                <p className="text-sm">Нет записей в журнале</p>
              </div>
            ) : (
              auditLogs.map((log) => <AuditRow key={log.id} log={log} />)
            )}
          </div>
          {auditTotalPages > 1 && (
            <Pagination page={auditPage} totalPages={auditTotalPages} onPageChange={setAuditPage} />
          )}
        </>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
