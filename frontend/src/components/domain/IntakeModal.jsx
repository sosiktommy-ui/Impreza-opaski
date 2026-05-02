import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import { listCities } from '../../api/cities';
import { intake, COLORS } from '../../api/inventory';

export default function IntakeModal({ open, onClose, onDone, defaultCityId }) {
  const [cities, setCities] = useState([]);
  const [cityId, setCityId] = useState(defaultCityId || '');
  const [color, setColor] = useState('BLACK');
  const [count, setCount] = useState(100);
  const [note, setNote] = useState('');
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
      await intake({ cityId, color, count: +count, note: note.trim() || undefined });
      onDone?.();
      onClose?.();
      setNote('');
      setCount(100);
    } catch (e) {
      setError(e?.response?.data?.error?.message || 'INTAKE_FAILED');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Поступление на склад"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            Отмена
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Сохраняем…' : 'Принять'}
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
          <label className="label">Цвет</label>
          <div className="flex gap-2 flex-wrap">
            {COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setColor(c.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-[10px] border text-sm transition-colors ${
                  color === c.id ? 'border-accent' : ''
                }`}
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
          <label className="label">Комментарий (необяз.)</label>
          <input
            className="input"
            placeholder="Например: партия от поставщика"
            value={note}
            onChange={(e) => setNote(e.target.value)}
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
