import { useState, useEffect, useMemo } from 'react';
import {
  History as HistoryIcon, Send, CalendarDays, ArrowRight, Search,
  ShieldCheck, Home, ArrowLeftRight, Globe, PackagePlus, UserPlus,
  UserCog, LogIn, LogOut, Lock, Trash2, PackageCheck, AlertTriangle,
  CheckCircle, XCircle, Edit3, RefreshCw, PackageX,
} from 'lucide-react';
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

/* ─── constants ─────────────────────────────────────────────────────────────── */

const EXPENSE_TYPE_META = {
  INTERNAL: { label: 'Внутренний', stripe: 'bg-emerald-500', badgeCls: 'bg-emerald-500/10 text-emerald-500', Icon: Home },
  EXTERNAL: { label: 'Внешний',    stripe: 'bg-sky-500',     badgeCls: 'bg-sky-500/10 text-sky-500',       Icon: ArrowLeftRight },
  THIRD:    { label: 'Сторонний',  stripe: 'bg-gray-400',    badgeCls: 'bg-gray-500/10 text-gray-400',     Icon: Globe },
};

const ROLE_LABELS = { ADMIN: 'Админ', OFFICE: 'Офис', COUNTRY: 'Страна', CITY: 'Город' };

const STATUS_META = {
  SENT:               { label: 'Отправлен',   variant: 'blue',    stripe: 'bg-sky-500' },
  ACCEPTED:           { label: 'Принят',      variant: 'green',   stripe: 'bg-emerald-500' },
  REJECTED:           { label: 'Отклонён',    variant: 'red',     stripe: 'bg-red-500' },
  DISCREPANCY_FOUND:  { label: 'Расхождение', variant: 'yellow',  stripe: 'bg-amber-400' },
  CANCELLED:          { label: 'Отменён',     variant: 'default', stripe: 'bg-gray-400' },
};

const BRACELET_ORDER = ['BLACK', 'WHITE', 'RED', 'BLUE'];

const TAB_FILTERS_BASE = [
  { key: 'all',          label: 'Все' },
  { key: 'transfers',    label: 'Отправки' },
  { key: 'expenses',     label: 'Расходы' },
  { key: 'problematic',  label: 'Проблемные' },
];

const AUDIT_META = {
  TRANSFER_SENT:          { label: 'Отправка',               Icon: Send,           cls: 'bg-sky-500/10 text-sky-400' },
  TRANSFER_ACCEPTED:      { label: 'Приёмка',                Icon: PackageCheck,   cls: 'bg-emerald-500/10 text-emerald-400' },
  TRANSFER_REJECTED:      { label: 'Отклонение',             Icon: XCircle,        cls: 'bg-red-500/10 text-red-400' },
  TRANSFER_CANCELLED:     { label: 'Отмена',                 Icon: PackageX,       cls: 'bg-gray-500/10 text-gray-400' },
  TRANSFER_EDITED:        { label: 'Редактирование',         Icon: Edit3,          cls: 'bg-amber-500/10 text-amber-400' },
  DISCREPANCY_FOUND:      { label: 'Расхождение',            Icon: AlertTriangle,  cls: 'bg-amber-500/10 text-amber-400' },
  DISCREPANCY_RESOLVED:   { label: 'Расхождение устранено',  Icon: CheckCircle,    cls: 'bg-emerald-500/10 text-emerald-400' },
  INVENTORY_ADJUSTED:     { label: 'Корректировка склада',   Icon: RefreshCw,      cls: 'bg-violet-500/10 text-violet-400' },
  USER_CREATED:           { label: 'Создание пользователя',  Icon: UserPlus,       cls: 'bg-brand-500/10 text-brand-400' },
  USER_UPDATED:           { label: 'Обновление пользователя',Icon: UserCog,        cls: 'bg-brand-500/10 text-brand-400' },
  USER_DELETED:           { label: 'Удаление пользователя',  Icon: Trash2,         cls: 'bg-red-500/10 text-red-400' },
  USER_LOGIN:             { label: 'Вход',                   Icon: LogIn,          cls: 'bg-gray-500/10 text-gray-400' },
  USER_LOGOUT:            { label: 'Выход',                  Icon: LogOut,         cls: 'bg-gray-500/10 text-gray-400' },
  PASSWORD_CHANGED:       { label: 'Смена пароля',           Icon: Lock,           cls: 'bg-gray-500/10 text-gray-400' },
  EXPENSE_CREATED:        { label: 'Расход создан',          Icon: CalendarDays,   cls: 'bg-amber-500/10 text-amber-400' },
  EXPENSE_DELETED:        { label: 'Расход удалён',          Icon: Trash2,         cls: 'bg-red-500/10 text-red-400' },
  COMPANY_LOSS_CREATED:   { label: 'Потеря компании',        Icon: PackageX,       cls: 'bg-red-500/10 text-red-400' },
  SHORTAGE_CREATED:       { label: 'Недостача',              Icon: AlertTriangle,  cls: 'bg-red-500/10 text-red-400' },
  WAREHOUSE_CREATED:      { label: 'Создание на складе',     Icon: PackagePlus,    cls: 'bg-violet-500/10 text-violet-400' },
};

/* ─── helpers ────────────────────────────────────────────────────────────────── */

function fmtDate(iso) {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function ActorChip({ user, label = 'Создал' }) {
  if (!user) return null;
  const name = user.displayName || user.username;
  const role = ROLE_LABELS[user.role] || user.role;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400">
      {label}: {name} · {role}
    </span>
  );
}

/* ─── TransferRow ─────────────────────────────────────────────────────────────── */

function TransferRow({ t }) {
  const st = STATUS_META[t.status] || { label: t.status, variant: 'default', stripe: 'bg-gray-400' };
  const senderName   = getSenderName(t);
  const receiverName = getReceiverName(t);
  const isAdmin      = isAdminTransfer(t);
  const totalQty     = getTotalQuantity(t);
  const hasDiscrepancy =
    t.status === 'DISCREPANCY_FOUND' ||
    (t.status === 'ACCEPTED' && t.acceptanceRecords?.some((r) => r.sentQuantity !== r.receivedQuantity));

  return (
    <div className="flex items-stretch">
      {/* left stripe */}
      <div className={`w-1 flex-shrink-0 rounded-l-[var(--radius-sm)] ${st.stripe}`} />
      <div className="flex-1 flex items-start gap-3 px-4 py-3">
        {/* icon */}
        <div className="w-8 h-8 rounded-full bg-sky-500/10 text-sky-400 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Send size={14} />
        </div>
        {/* body */}
        <div className="flex-1 min-w-0">
          {/* row 1: id + status + admin badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-content-muted font-mono">#{t.id?.slice(-6) || '—'}</span>
            <Badge variant={st.variant}>{st.label}</Badge>
            {isAdmin && (
              <span className="text-[10px] px-1.5 py-0.5 bg-violet-500/15 text-violet-400 rounded-full font-medium">
                👑 Создан офисом
              </span>
            )}
            {hasDiscrepancy && t.status === 'ACCEPTED' && (
              <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/15 text-amber-400 rounded-full font-medium">
                ⚠ Было расхождение
              </span>
            )}
          </div>
          {/* row 2: sender → receiver */}
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="text-sm font-semibold text-sky-400">{senderName}</span>
            <ArrowRight size={12} className="text-content-muted flex-shrink-0" />
            <span className="text-sm font-semibold text-emerald-400">{receiverName}</span>
          </div>
          {/* row 3: bracelets */}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {t.items?.map((item) => (
              <BraceletBadge key={item.itemType} type={item.itemType} count={item.quantity} />
            ))}
            {totalQty > 0 && (
              <span className="text-[10px] text-content-muted ml-0.5">итого {totalQty} шт</span>
            )}
          </div>
          {/* row 4: meta */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-[10px] text-content-muted">{fmtDate(t.createdAt)}</span>
            {t.notes && (
              <span className="text-[10px] text-content-secondary italic">· "{t.notes}"</span>
            )}
            {t.createdByUser && <ActorChip user={t.createdByUser} label="Создал" />}
            {t.acceptanceRecords?.[0]?.acceptedBy && (
              <ActorChip user={t.acceptanceRecords[0].acceptedBy} label="Принял" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── ExpenseRow ──────────────────────────────────────────────────────────────── */

function ExpenseRow({ e }) {
  const typeMeta = EXPENSE_TYPE_META[e.type] ?? EXPENSE_TYPE_META.INTERNAL;
  const TypeIcon  = typeMeta.Icon;
  const actor     = e.actorUser;
  const isExternal = e.type === 'EXTERNAL';

  return (
    <div className="flex items-stretch">
      {/* left stripe */}
      <div className={`w-1 flex-shrink-0 rounded-l-[var(--radius-sm)] ${typeMeta.stripe}`} />
      <div className="flex-1 flex items-start gap-3 px-4 py-3">
        {/* icon */}
        <div className="w-8 h-8 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center flex-shrink-0 mt-0.5">
          <CalendarDays size={14} />
        </div>
        {/* body */}
        <div className="flex-1 min-w-0">
          {/* row 1: event name + type badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-content-primary">{e.eventName}</span>
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${typeMeta.badgeCls}`}>
              <TypeIcon size={9} />{typeMeta.label}
            </span>
          </div>
          {/* row 2: city / direction */}
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {isExternal && e.city && e.targetCity ? (
              <>
                <span className="text-xs font-medium text-sky-400">{e.city.name}</span>
                <ArrowRight size={11} className="text-content-muted flex-shrink-0" />
                <span className="text-xs font-medium text-emerald-400">{e.targetCity.name}</span>
              </>
            ) : (
              e.city && <span className="text-xs text-content-muted">{e.city.name}</span>
            )}
            {e.location && (
              <span className="text-[10px] text-content-muted">· {e.location}</span>
            )}
          </div>
          {/* row 3: bracelets */}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {BRACELET_ORDER.map((type) => {
              const qty = e[type.toLowerCase()];
              return qty > 0 ? <BraceletBadge key={type} type={type} count={qty} /> : null;
            })}
          </div>
          {/* row 4: meta */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-[10px] text-content-muted">{fmtDate(e.createdAt)}</span>
            {actor && <ActorChip user={actor} label="Добавил" />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── AuditRow ────────────────────────────────────────────────────────────────── */

function AuditRow({ log }) {
  const am   = AUDIT_META[log.action] || { label: log.action, Icon: ShieldCheck, cls: 'bg-violet-500/10 text-violet-400' };
  const Icon = am.Icon;
  const meta = log.metadata || {};
  const actorName = log.actor?.displayName || log.actor?.username || log.actorId?.slice(-6) || '—';
  const actorRole = log.actor?.role;

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${am.cls}`}>
        <Icon size={14} />
      </div>
      <div className="flex-1 min-w-0">
        {/* row 1: action label + entity id */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-content-primary">{am.label}</span>
          {log.entityId && (
            <span className="text-[10px] text-content-muted font-mono bg-surface-secondary px-1.5 py-0.5 rounded">
              #{log.entityId.slice(-6)}
            </span>
          )}
          {log.entityType && (
            <span className="text-[10px] text-content-muted">{log.entityType}</span>
          )}
        </div>
        {/* row 2: actor */}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <ActorChip user={log.actor || (actorName !== '—' ? { displayName: actorName, role: actorRole } : null)} label="Кто" />
        </div>
        {/* row 3: metadata details */}
        {meta.notes && (
          <p className="text-[10px] text-content-secondary mt-1 italic">"{meta.notes}"</p>
        )}
        {meta.oldItems && meta.newItems && (
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {BRACELET_ORDER.map((type) => {
              const from = meta.oldItems[type] ?? 0;
              const to   = meta.newItems[type] ?? 0;
              if (from === 0 && to === 0) return null;
              const changed = from !== to;
              return (
                <span key={type} className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${changed ? 'bg-amber-500/10 text-amber-400' : 'bg-surface-secondary text-content-muted'}`}>
                  {type[0]}: {from}→{to}
                </span>
              );
            })}
          </div>
        )}
        {/* row 4: date */}
        <span className="text-[10px] text-content-muted mt-1 block">{fmtDate(log.createdAt)}</span>
      </div>
    </div>
  );
}

/* ─── main component ──────────────────────────────────────────────────────────── */

export default function History() {
  const { user }                       = useAuthStore();
  const { countryId, cityId, eventId } = useFilterStore();
  const [transfers,       setTransfers]       = useState([]);
  const [expenses,        setExpenses]        = useState([]);
  const [auditLogs,       setAuditLogs]       = useState([]);
  const [auditPage,       setAuditPage]       = useState(1);
  const [auditTotalPages, setAuditTotalPages] = useState(1);
  const [loading,         setLoading]         = useState(true);
  const [tab,             setTab]             = useState('all');
  const [page,            setPage]            = useState(1);
  const [search,          setSearch]          = useState('');
  const perPage = 30;

  const canSeeAudit = user?.role === 'ADMIN' || user?.role === 'OFFICE';
  const TAB_FILTERS = canSeeAudit
    ? [...TAB_FILTERS_BASE, { key: 'audit', label: 'Журнал' }]
    : TAB_FILTERS_BASE;

  useEffect(() => { loadData(); }, [countryId, cityId, eventId]);
  useEffect(() => {
    if (tab === 'audit' && canSeeAudit) loadAudit(auditPage);
  }, [tab, auditPage]);

  const loadAudit = async (p = 1) => {
    try {
      const { data }  = await auditApi.getAll({ page: p, limit: perPage });
      const payload   = data?.data || data;
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
      if (cityId)    filterParams.cityId    = cityId;
      if (eventId)   filterParams.eventId   = eventId;

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
      const isProblematic = (t) => {
        if (t.status === 'DISCREPANCY_FOUND') return true;
        if (t.status === 'ACCEPTED' && t.acceptanceRecords?.length > 0) {
          return t.acceptanceRecords.some((r) => r.sentQuantity !== r.receivedQuantity);
        }
        return false;
      };
      items.push(...transfers
        .filter(isProblematic)
        .map((t) => ({ ...t, _type: 'transfer', _date: new Date(t.createdAt) })));
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((item) => {
        if (item._type === 'transfer') {
          const sender   = getSenderName(item).toLowerCase();
          const receiver = getReceiverName(item).toLowerCase();
          return sender.includes(q) || receiver.includes(q) ||
            (item.id || '').toLowerCase().includes(q) ||
            (item.notes || '').toLowerCase().includes(q);
        }
        return (item.eventName || '').toLowerCase().includes(q) ||
          (item.city?.name || '').toLowerCase().includes(q) ||
          (item.location || '').toLowerCase().includes(q);
      });
    }

    items.sort((a, b) => b._date - a._date);
    return items;
  }, [transfers, expenses, tab, search]);

  const totalPages = Math.ceil(combined.length / perPage);
  const paged      = combined.slice((page - 1) * perPage, page * perPage);

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

  /* count badges */
  const transfersCount   = transfers.length;
  const expensesCount    = expenses.length;
  const problematicCount = transfers.filter((t) => {
    if (t.status === 'DISCREPANCY_FOUND') return true;
    return t.status === 'ACCEPTED' && t.acceptanceRecords?.some((r) => r.sentQuantity !== r.receivedQuantity);
  }).length;

  const TAB_COUNTS = { transfers: transfersCount, expenses: expensesCount, problematic: problematicCount };

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex items-center gap-3">
        <HistoryIcon size={20} className="text-brand-500" />
        <h2 className="text-lg font-bold text-content-primary">История</h2>
        <span className="text-xs text-content-muted bg-surface-card border border-edge px-2 py-0.5 rounded-full">
          {combined.length} записей
        </span>
      </div>

      {/* filters row */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        {/* tab pills */}
        <div className="flex items-center gap-1 bg-surface-card border border-edge rounded-[var(--radius-sm)] p-0.5 w-fit">
          {TAB_FILTERS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`relative px-3 py-1.5 text-sm font-medium rounded-[var(--radius-sm)] transition-colors ${
                tab === t.key
                  ? 'bg-brand-600 text-white'
                  : 'text-content-secondary hover:text-content-primary'
              }`}
            >
              {t.label}
              {TAB_COUNTS[t.key] > 0 && (
                <span className={`ml-1.5 text-[10px] font-semibold ${tab === t.key ? 'opacity-80' : 'text-content-muted'}`}>
                  {TAB_COUNTS[t.key]}
                </span>
              )}
              {t.key === 'problematic' && problematicCount > 0 && tab !== 'problematic' && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* search */}
        {tab !== 'audit' && (
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
            <input
              type="text"
              placeholder="Поиск..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3 py-2 border border-edge bg-surface-card text-content-primary rounded-[var(--radius-sm)] text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:outline-none placeholder:text-content-muted"
            />
          </div>
        )}
      </div>

      {/* content */}
      {tab === 'audit' ? (
        <>
          <div className="bg-surface-card border border-edge rounded-[var(--radius-md)] divide-y divide-edge overflow-hidden">
            {auditLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-content-muted">
                <ShieldCheck size={36} className="mb-2 opacity-30" />
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
          <div className="bg-surface-card border border-edge rounded-[var(--radius-md)] divide-y divide-edge overflow-hidden">
            {paged.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-content-muted">
                <HistoryIcon size={36} className="mb-2 opacity-30" />
                <p className="text-sm">{search ? 'Ничего не найдено' : 'Нет записей'}</p>
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
