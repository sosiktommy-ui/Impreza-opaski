import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import { listCities } from '../../api/cities';
import { COLORS } from '../../api/inventory';
import { createExpense, EXPENSE_KINDS } from '../../api/expenses';

const CREATABLE_KINDS = EXPENSE_KINDS.filter((k) => k.id !== 'SHORTAGE');

export default function ExpenseNewModal({ open, onClose, onDone, defaultCityId }) {
  const [cities, setCities] = useState([]);
  const [cityId, setCityId] = useState(defaultCityId || '');
  const [color, setColor] = useState('BLACK');
  const [count, setCount] = useState(1);
  const [kind, setKind] = useState('PROMO');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    listCities().then(setCities).catch(() => {});
    if (defaultCityId) setCityId(defaultCityId);
  }, [open, defaultCityId]);

  async function submit() {
    setError(null);
    if (!cityId) return setError('Выберите город');
    if (!Number.isFinite(+count) || +count < 1) return setError('Количество ≥ 1');
    setSubmitting(true);
    try {
      await createExpense({
        cityId,
        color,
        count: +count,
        kind,
        reason: reason.trim() || undefined,
      });
      onDone?.();
      onClose?.();
      setCount(1);
      setReason('');
    } catch (e) {
      setError(e?.response?.data?.error?.message || 'EXPENSE_FAILED');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Новый расход"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            Отмена
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Сохраняем…' : 'Списать'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">Город</label>
          <select className="select" value={cityId} onChange={(e) => setCityId(e.target.value)}>
            <option value="">— выберите —</option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.country?.code || c.countryCode || '—'})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Тип расхода</label>
          <div className="flex flex-wrap gap-2">
            {CREATABLE_KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors border`}
                style={{
                  background: kind === k.id ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'var(--surface-2)',
                  color: kind === k.id ? 'var(--accent)' : 'var(--text-2)',
                  borderColor: kind === k.id ? 'var(--accent)' : 'var(--border)',
                }}
              >
                {k.label}
              </button>
            ))}
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--text-3)' }}>SHORTAGE создаётся автоматически при разрешении расхождений</p>
        </div>

        <div>
          <label className="label">Цвет</label>
          <div className="flex gap-2 flex-wrap">
            {COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setColor(c.id)}
                className="flex items-center gap-2 px-3 py-2 rounded-[10px] border text-sm transition-colors"
                style={{
                  borderColor: color === c.id ? 'var(--accent)' : 'var(--border)',
                  background: color === c.id ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'var(--surface)',
                }}
              >
                <span className={`swatch ${c.sw}`} />
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Количество</label>
          <input
            type="number"
            min={1}
            className="input"
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
        </div>

        <div>
          <label className="label">Причина (необяз.)</label>
          <input
            className="input"
            placeholder="Кратко опишите причину"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
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
