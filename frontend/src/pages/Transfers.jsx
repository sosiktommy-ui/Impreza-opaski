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

  useEffect(() => { refresh(); }, [statusFilter]); // eslint-disable-line

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
        subtitle="Активные и завершённые операции"
      />

      <div className="px-7 py-7 max-w-[1320px] mx-auto fade-in">
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="seg">
            {STATUS_FILTERS.slice(0, 4).map((f) => (
              <button
                key={f.id || 'all'}
                onClick={() => setStatusFilter(f.id)}
                className={`seg-btn ${statusFilter === f.id ? 'active' : ''}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-2">
            {canCreate && (
              <button className="btn btn-primary" onClick={() => setNewOpen(true)}>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
                Новый перевод
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="space-y-2.5">
            {[1, 2, 3].map((i) => <div key={i} className="card shimmer" style={{ height: 110 }} />)}
          </div>
        ) : error ? (
          <div className="card p-6 text-center" style={{ color: 'var(--danger)' }}>{error}</div>
        ) : items.length === 0 ? (
          <div className="card p-10 text-center">
            <h2 className="text-[15px] font-semibold">Переводов пока нет</h2>
            <p className="text-[13px] mt-1" style={{ color: 'var(--text-2)' }}>
              {canCreate ? 'Создайте первый перевод кнопкой выше.' : 'Нет доступных переводов.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {items.map((t) => (
              <TransferCard
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

function TransferCard({ t, user, busy, canResolve, onAccept, onReject, onResolve, onCancel }) {
  const status = TRANSFER_STATUS[t.status] || { label: t.status, tone: 'muted' };
  const total = (t.lines || []).reduce((s, l) => s + l.sentCount, 0);
  const recvTotal = (t.lines || []).reduce((s, l) => s + (l.receivedCount ?? 0), 0);
  const fromName = t.fromCity?.name || '—';
  const toName = t.toCity?.name || '—';
  const isPending = t.status === 'PENDING';
  const isDiscr = t.status === 'DISCREPANCY';
  const isMine = t.createdById === user?.id;

  const cardStyle = isDiscr
    ? { borderColor: 'color-mix(in srgb, var(--warning) 35%, var(--border))' }
    : {};

  return (
    <div className="card p-5" style={cardStyle}>
      {/* Header row */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className={`pill pill-${status.tone}`}>{status.label}</span>
        <div className="flex-1 flex items-center gap-2.5 text-[14px]">
          <span className="font-semibold">{fromName}</span>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ color: 'var(--text-3)', flexShrink: 0 }}>
            <path d="M5 12h14M13 5l7 7-7 7"/>
          </svg>
          <span className="font-semibold">{toName}</span>
        </div>
        <span className="mono text-[12px]" style={{ color: 'var(--text-3)' }}>
          {new Date(t.createdAt).toLocaleDateString('ru-RU')} · #{t.id.slice(0, 7)}
        </span>
      </div>

      {/* Lines + actions */}
      <div className="flex items-center gap-4 mt-4 pt-4 flex-wrap" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3 flex-wrap flex-1">
          {(t.lines || []).map((l) => {
            const c = COLOR_MAP[l.color];
            const diff = l.receivedCount != null && l.receivedCount !== l.sentCount;
            return (
              <span key={l.color} className="flex items-center gap-1.5 text-[13px]">
                <span className={`swatch ${c?.sw || ''}`} />
                <span className="mono">
                  {isDiscr && l.receivedCount != null ? (
                    <>
                      {l.sentCount}
                      <span style={{ color: 'var(--text-3)' }}> → </span>
                      <span style={{ color: diff ? 'var(--danger)' : 'inherit' }}>{l.receivedCount}</span>
                    </>
                  ) : (
                    l.sentCount
                  )}
                </span>
              </span>
            );
          })}
          {t.comment && (
            <span className="text-[12px] italic" style={{ color: 'var(--text-3)' }}>«{t.comment}»</span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isPending && (
            <>
              {isMine && (
                <button className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>Отменить</button>
              )}
              <button className="btn btn-secondary btn-sm" onClick={onReject} disabled={busy}>Отклонить</button>
              <button className="btn btn-primary btn-sm" onClick={onAccept} disabled={busy}>Принять</button>
            </>
          )}
          {isDiscr && canResolve && (
            <>
              <button className="btn btn-secondary btn-sm" onClick={onReject} disabled={busy}>Списать как утерю</button>
              <button className="btn btn-primary btn-sm" onClick={onResolve} disabled={busy}>Решить</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
