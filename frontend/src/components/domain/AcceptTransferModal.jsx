import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import { COLORS } from '../../api/inventory';
import { acceptTransfer } from '../../api/transfers';

const COLOR_LABEL = Object.fromEntries(COLORS.map((c) => [c.id, c]));

export default function AcceptTransferModal({ open, onClose, transfer, onDone }) {
  const [received, setReceived] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !transfer) return;
    setError(null);
    const init = {};
    for (const l of transfer.lines || []) init[l.color] = l.sentCount;
    setReceived(init);
  }, [open, transfer]);

  if (!transfer) return null;

  const sentTotal = (transfer.lines || []).reduce((s, l) => s + l.sentCount, 0);
  const recvTotal = Object.values(received).reduce((s, n) => s + (Number(n) || 0), 0);
  const hasDiff = (transfer.lines || []).some((l) => Number(received[l.color] || 0) !== l.sentCount);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const lines = (transfer.lines || []).map((l) => ({
        color: l.color,
        receivedCount: Math.max(0, Math.min(l.sentCount, Number(received[l.color] || 0))),
      }));
      await acceptTransfer(transfer.id, { lines });
      onDone?.();
      onClose?.();
    } catch (e) {
      setError(e?.response?.data?.error?.message || 'ACCEPT_FAILED');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Приёмка передачи"
      size="md"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            Отмена
          </button>
          <button
            className={hasDiff ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={submit}
            disabled={submitting}
          >
            {submitting
              ? 'Сохраняем…'
              : hasDiff
              ? 'Принять с расхождением'
              : 'Принять полностью'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="text-xs text-text-2">
          Отправлено всего: <span className="mono font-semibold">{sentTotal}</span> · Принимаем:{' '}
          <span className="mono font-semibold">{recvTotal}</span>
        </div>

        <div className="space-y-2">
          {(transfer.lines || []).map((l) => {
            const c = COLOR_LABEL[l.color];
            const val = Number(received[l.color] || 0);
            const diff = val !== l.sentCount;
            return (
              <div
                key={l.color}
                className="flex items-center gap-3 px-3 py-2 rounded-[10px]"
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid',
                  borderColor: diff
                    ? 'color-mix(in srgb, var(--danger) 35%, transparent)'
                    : 'transparent',
                }}
              >
                <span className={`swatch ${c?.sw || ''}`} />
                <span className="text-sm flex-1">{c?.label || l.color}</span>
                <span className="text-text-3 text-xs mono">из {l.sentCount}</span>
                <input
                  type="number"
                  min={0}
                  max={l.sentCount}
                  className="input mono text-right"
                  style={{ width: 90, padding: '6px 10px' }}
                  value={received[l.color] ?? 0}
                  onChange={(e) =>
                    setReceived((r) => ({ ...r, [l.color]: e.target.value.replace(/[^\d]/g, '') }))
                  }
                />
              </div>
            );
          })}
        </div>

        {hasDiff && (
          <div
            className="text-xs px-3 py-2 rounded-md"
            style={{
              background: 'color-mix(in srgb, var(--warning) 12%, transparent)',
              color: 'var(--warning)',
            }}
          >
            Есть расхождение. Передача попадёт в статус «Расхождение» и потребует решения.
          </div>
        )}

        {error && (
          <div
            className="text-xs px-3 py-2 rounded-md"
            style={{
              background: 'color-mix(in srgb, var(--danger) 12%, transparent)',
              color: 'var(--danger)',
            }}
          >
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
