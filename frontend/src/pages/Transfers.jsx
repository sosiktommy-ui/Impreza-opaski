import { useEffect, useState } from 'react';
import Header from '../components/layout/Header';
import TransferNewModal from '../components/domain/TransferNewModal';
import AcceptTransferModal from '../components/domain/AcceptTransferModal';
import {
  listTransfers,
  rejectTransfer,
  resolveTransfer,
  cancelTransfer,
  TRANSFER_STATUS,
} from '../api/transfers';
import { COLORS } from '../api/inventory';
import { useAuthStore } from '../store/useAuthStore';

const COLOR_MAP = Object.fromEntries(COLORS.map((c) => [c.id, c]));

const STATUS_FILTERS = [
  { id: '', label: 'Все' },
  { id: 'PENDING', label: 'Ожидают' },
  { id: 'DISCREPANCY', label: 'Расхождение' },
  { id: 'ACCEPTED', label: 'Приняты' },
  { id: 'RESOLVED', label: 'Закрыты' },
  { id: 'REJECTED', label: 'Отклонены' },
  { id: 'CANCELLED', label: 'Отменены' },
];

export default function Transfers() {
  const { user } = useAuthStore();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [acceptTarget, setAcceptTarget] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const canCreate = user && user.role !== 'COUNTRY';
  const canResolve = user?.role === 'ADMIN' || user?.role === 'OFFICE';

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const params = statusFilter ? { status: statusFilter } : {};
      const res = await listTransfers(params);
      setItems(res || []);
    } catch (e) {
      setError(e?.response?.data?.error?.message || 'LOAD_FAILED');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function doAction(fn, id) {
    setBusyId(id);
    try {
      await fn(id);
      await refresh();
    } catch (e) {
      alert(e?.response?.data?.error?.message || 'ACTION_FAILED');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <Header
        title="Передачи"
        subtitle="Перемещения браслетов между городами"
        right={
          canCreate && (
            <button className="btn btn-primary btn-sm" onClick={() => setNewOpen(true)}>
              + Новая передача
            </button>
          )
        }
      />

      <div className="p-6 md:p-8 fade-in">
        <div className="flex items-center gap-1 mb-5 p-1 inline-flex rounded-[10px] flex-wrap" style={{ background: 'var(--surface)' }}>
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id || 'all'}
              onClick={() => setStatusFilter(f.id)}
              className="px-3 py-1.5 text-sm rounded-md transition-colors"
              style={{
                background: statusFilter === f.id ? 'var(--surface-2)' : 'transparent',
                color: statusFilter === f.id ? 'var(--text)' : 'var(--text-2)',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card p-5 shimmer" style={{ height: 110 }} />
            ))}
          </div>
        ) : error ? (
          <div className="card p-6 text-center" style={{ color: 'var(--danger)' }}>{error}</div>
        ) : items.length === 0 ? (
          <div className="card p-10 text-center">
            <div className="text-text-3 text-3xl mb-3">⇄</div>
            <h2 className="text-[15px] font-semibold">Передач пока нет</h2>
            <p className="text-text-2 text-sm mt-1">Создайте первую передачу между городами.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((t) => (
              <TransferRow
                key={t.id}
                t={t}
                user={user}
                busy={busyId === t.id}
                canResolve={canResolve}
                onAccept={() => setAcceptTarget(t)}
                onReject={() => doAction(rejectTransfer, t.id)}
                onResolve={() => doAction(resolveTransfer, t.id)}
                onCancel={() => doAction(cancelTransfer, t.id)}
              />
            ))}
          </div>
        )}
      </div>

      <TransferNewModal open={newOpen} onClose={() => setNewOpen(false)} onDone={refresh} />
      <AcceptTransferModal
        open={!!acceptTarget}
        transfer={acceptTarget}
        onClose={() => setAcceptTarget(null)}
        onDone={refresh}
      />
    </>
  );
}

function TransferRow({ t, user, busy, canResolve, onAccept, onReject, onResolve, onCancel }) {
  const status = TRANSFER_STATUS[t.status] || { label: t.status, tone: 'muted' };
  const total = (t.lines || []).reduce((s, l) => s + l.sentCount, 0);
  const recvTotal = (t.lines || []).reduce(
    (s, l) => s + (l.receivedCount ?? 0),
    0,
  );
  const fromName = t.fromCity?.name;
  const toName = t.toCity?.name;
  const fromCode = t.fromCity?.country?.code;
  const toCode = t.toCity?.country?.code;

  const isPending = t.status === 'PENDING';
  const isDiscr = t.status === 'DISCREPANCY';
  const isMine = t.createdById === user?.id;

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-text-3 font-semibold">
            <span>{new Date(t.createdAt).toLocaleString('ru-RU')}</span>
            <span className="text-text-3">·</span>
            <span className="mono">#{t.id.slice(0, 6)}</span>
          </div>
          <div className="flex items-center gap-2 mt-1.5 text-[15px] font-semibold tracking-tight">
            <span>{fromName || '—'}</span>
            {fromCode && <span className="text-text-3 text-xs mono">({fromCode})</span>}
            <span className="text-text-3">→</span>
            <span>{toName || '—'}</span>
            {toCode && <span className="text-text-3 text-xs mono">({toCode})</span>}
          </div>
          {t.comment && (
            <div className="text-text-2 text-sm mt-1 italic truncate">«{t.comment}»</div>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-text-3 font-semibold">
              {isDiscr || t.status === 'ACCEPTED' || t.status === 'RESOLVED' ? 'Принято/Отпр.' : 'Отправлено'}
            </div>
            <div className="text-[16px] font-semibold mono">
              {isDiscr || t.status === 'ACCEPTED' || t.status === 'RESOLVED'
                ? `${recvTotal} / ${total}`
                : total}
            </div>
          </div>
          <span className={`pill pill-${status.tone}`}>{status.label}</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {(t.lines || []).map((l) => {
          const c = COLOR_MAP[l.color];
          const diff =
            l.receivedCount != null && l.receivedCount !== l.sentCount;
          return (
            <div
              key={l.color}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid',
                borderColor: diff ? 'color-mix(in srgb, var(--danger) 35%, transparent)' : 'transparent',
              }}
            >
              <span className={`swatch ${c?.sw || ''}`} style={{ width: 12, height: 12 }} />
              <span className="text-text-2">{c?.label || l.color}</span>
              <span className="mono font-semibold">
                {l.receivedCount != null ? `${l.receivedCount}/${l.sentCount}` : l.sentCount}
              </span>
            </div>
          );
        })}
      </div>

      {(isPending || isDiscr) && (
        <div className="mt-4 flex flex-wrap gap-2 justify-end">
          {isPending && (
            <>
              {isMine && (
                <button className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>
                  Отменить
                </button>
              )}
              <button className="btn btn-secondary btn-sm" onClick={onReject} disabled={busy}>
                Отклонить
              </button>
              <button className="btn btn-primary btn-sm" onClick={onAccept} disabled={busy}>
                Принять
              </button>
            </>
          )}
          {isDiscr && canResolve && (
            <button className="btn btn-primary btn-sm" onClick={onResolve} disabled={busy}>
              Закрыть расхождение
            </button>
          )}
        </div>
      )}
    </div>
  );
}
