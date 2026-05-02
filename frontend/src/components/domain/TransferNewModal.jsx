import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import { listCities } from '../../api/cities';
import { COLORS } from '../../api/inventory';
import { createTransfer } from '../../api/transfers';

export default function TransferNewModal({ open, onClose, onDone, defaultFromCityId }) {
  const [cities, setCities] = useState([]);
  const [fromCityId, setFromCityId] = useState(defaultFromCityId || '');
  const [toCityId, setToCityId] = useState('');
  const [lines, setLines] = useState({ BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 });
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    listCities().then(setCities).catch(() => {});
    if (defaultFromCityId) setFromCityId(defaultFromCityId);
  }, [open, defaultFromCityId]);

  const total = Object.values(lines).reduce((s, n) => s + (Number(n) || 0), 0);

  async function submit() {
    setError(null);
    if (!fromCityId || !toCityId) return setError('Выберите оба города');
    if (fromCityId === toCityId) return setError('Города должны отличаться');
    const payloadLines = Object.entries(lines)
      .map(([color, n]) => ({ color, sentCount: Number(n) || 0 }))
      .filter((l) => l.sentCount > 0);
    if (!payloadLines.length) return setError('Укажите количество хотя бы одного цвета');

    setSubmitting(true);
    try {
      await createTransfer({
        fromCityId,
        toCityId,
        lines: payloadLines,
        comment: comment.trim() || undefined,
      });
      onDone?.();
      onClose?.();
      setLines({ BLACK: 0, WHITE: 0, RED: 0, BLUE: 0 });
      setComment('');
    } catch (e) {
      setError(e?.response?.data?.error?.message || 'TRANSFER_FAILED');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Новая передача"
      size="lg"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            Отмена
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Отправляем…' : `Отправить (${total})`}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Откуда</label>
            <select className="select" value={fromCityId} onChange={(e) => setFromCityId(e.target.value)}>
              <option value="">— город —</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.country?.code || c.countryCode || '—'})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Куда</label>
            <select className="select" value={toCityId} onChange={(e) => setToCityId(e.target.value)}>
              <option value="">— город —</option>
              {cities
                .filter((c) => c.id !== fromCityId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.country?.code || c.countryCode || '—'})
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Количество по цветам</label>
          <div className="grid grid-cols-2 gap-2">
            {COLORS.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 px-3 py-2 rounded-[10px]"
                style={{ background: 'var(--surface-2)' }}
              >
                <span className={`swatch ${c.sw}`} />
                <span className="text-sm text-text-2 flex-1">{c.label}</span>
                <input
                  type="number"
                  min={0}
                  className="input mono text-right"
                  style={{ width: 90, padding: '6px 10px' }}
                  value={lines[c.id]}
                  onChange={(e) =>
                    setLines((l) => ({ ...l, [c.id]: e.target.value.replace(/[^\d]/g, '') }))
                  }
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Комментарий (необяз.)</label>
          <input
            className="input"
            placeholder="Например: курьер, машина, сопровождение"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>

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
