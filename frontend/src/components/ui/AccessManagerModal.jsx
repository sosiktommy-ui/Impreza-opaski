import { useEffect, useState } from 'react';
import { Globe, Building2, Map as MapIcon, MapPin, Trash2, Plus } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import Select from './Select';
import { accessApi } from '../../api/access';
import { usersApi } from '../../api/users';

const SCOPE_TYPES = [
  { value: 'GLOBAL',  label: 'Глобально (все)' },
  { value: 'OFFICE',  label: 'Офис' },
  { value: 'COUNTRY', label: 'Страна' },
  { value: 'CITY',    label: 'Город' },
];

const SCOPE_ICON = { GLOBAL: Globe, OFFICE: Building2, COUNTRY: MapIcon, CITY: MapPin };
const SCOPE_LABEL = { GLOBAL: 'Глобально', OFFICE: 'Офис', COUNTRY: 'Страна', CITY: 'Город' };

function fmtDate(value) {
  if (!value) return null;
  try { return new Date(value).toLocaleDateString('ru-RU'); } catch { return null; }
}

export default function AccessManagerModal({
  open,
  user,
  offices = [],
  countries = [],
  onClose,
  initialScopeType,
  initialScopeId,
  initialAccessType,
  initialCountryForCity,
}) {
  const [accesses, setAccesses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [scopeType, setScopeType] = useState('CITY');
  const [scopeId, setScopeId] = useState('');
  const [accessType, setAccessType] = useState('FULL');
  const [expiresAt, setExpiresAt] = useState('');
  const [notes, setNotes] = useState('');
  const [countryForCity, setCountryForCity] = useState('');
  const [cities, setCities] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const reload = async () => {
    if (!user?.id) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await accessApi.listForUser(user.id);
      const list = data?.accesses ?? data?.data?.accesses ?? data ?? [];
      setAccesses(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err.response?.data?.message || 'Не удалось загрузить доступы');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && user?.id) {
      reload();
      // reset form
      setScopeType(initialScopeType || 'CITY');
      setScopeId(initialScopeId || '');
      setAccessType(initialAccessType || 'FULL');
      setExpiresAt('');
      setNotes('');
      setCountryForCity(initialCountryForCity || '');
      setCities([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id, initialScopeType, initialScopeId, initialAccessType, initialCountryForCity]);

  useEffect(() => {
    if (!open || !countryForCity || scopeType !== 'CITY') return;
    onCountryForCityChange({ target: { value: countryForCity } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    setScopeId('');
    setCities([]);
    setCountryForCity('');
    if (scopeType === 'GLOBAL' || scopeType === 'OFFICE') {
      setAccessType('FULL');
    }
  }, [scopeType]);

  const onCountryForCityChange = async (e) => {
    const cid = e.target.value;
    setCountryForCity(cid);
    setScopeId('');
    if (!cid) { setCities([]); return; }
    try {
      const { data } = await usersApi.getCities(cid);
      setCities(Array.isArray(data) ? data : (data?.data || data || []));
    } catch {
      setCities([]);
    }
  };

  const handleRevoke = async (id) => {
    if (!confirm('Отозвать этот доступ?')) return;
    try {
      await accessApi.revoke(id);
      await reload();
    } catch (err) {
      setError(err.response?.data?.message || 'Не удалось отозвать');
    }
  };

  const handleGrant = async (e) => {
    e.preventDefault();
    setError('');

    if (scopeType !== 'GLOBAL' && !scopeId) {
      setError('Выберите цель доступа');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        userId: user.id,
        scopeType,
        scopeId: scopeType === 'GLOBAL' ? null : scopeId,
        accessType,
      };
      if (expiresAt) payload.expiresAt = new Date(expiresAt).toISOString();
      if (notes.trim()) payload.notes = notes.trim();

      await accessApi.grant(payload);
      setScopeId('');
      setExpiresAt('');
      setNotes('');
      setCountryForCity('');
      setCities([]);
      await reload();
    } catch (err) {
      setError(err.response?.data?.message || 'Не удалось выдать доступ');
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <Modal open={open} onClose={onClose} title={`Доступы — ${user.displayName || user.username}`} wide>
      <div className="space-y-4">
        {/* Existing accesses */}
        <div>
          <h3 className="text-sm font-semibold text-content-primary mb-2">Текущие доступы</h3>
          {loading && <div className="text-xs text-content-muted">Загрузка…</div>}
          {!loading && accesses.length === 0 && (
            <div className="text-xs text-content-muted py-2">Доступов нет</div>
          )}
          {!loading && accesses.length > 0 && (
            <div className="space-y-1.5">
              {accesses.map((a) => {
                const Icon = SCOPE_ICON[a.scopeType] ?? Globe;
                const name = a.target?.name ?? (a.scopeType === 'GLOBAL' ? 'Все подразделения' : '—');
                const expired = a.expiresAt && new Date(a.expiresAt) < new Date();
                const revoked = !!a.revokedAt;
                const active = !revoked && !expired;
                return (
                  <div key={a.id} className="flex items-center gap-2 p-2 rounded-[var(--radius-sm)] border border-edge">
                    <Icon size={16} className="text-brand-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-content-primary truncate">{name}</div>
                      <div className="text-[11px] text-content-muted truncate">
                        {SCOPE_LABEL[a.scopeType]}
                        {a.accessType ? ` • ${a.accessType === 'PARTIAL' ? 'ограниченный' : 'полный'}` : ''}
                        {a.expiresAt ? ` • до ${fmtDate(a.expiresAt)}` : ''}
                        {a.notes ? ` • ${a.notes}` : ''}
                      </div>
                    </div>
                    {active && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">активен</span>
                    )}
                    {revoked && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/15 text-red-400 border border-red-500/20">отозван</span>
                    )}
                    {!revoked && expired && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/20">истёк</span>
                    )}
                    {active && (
                      <button
                        onClick={() => handleRevoke(a.id)}
                        className="p-1.5 rounded-[var(--radius-sm)] hover:bg-red-500/10 text-content-muted hover:text-red-500"
                        title="Отозвать"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Grant new */}
        <form onSubmit={handleGrant} className="border-t border-edge pt-4 space-y-3">
          <h3 className="text-sm font-semibold text-content-primary">Выдать новый доступ</h3>

          <Select
            label="Тип области"
            value={scopeType}
            onChange={(e) => setScopeType(e.target.value)}
          >
            {SCOPE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>

          <Select
            label="Тип доступа"
            value={accessType}
            onChange={(e) => setAccessType(e.target.value)}
            disabled={scopeType === 'GLOBAL' || scopeType === 'OFFICE'}
          >
            <option value="FULL">Полный (FULL)</option>
            <option value="PARTIAL">Ограниченный (PARTIAL)</option>
          </Select>

          {scopeType === 'OFFICE' && (
            <Select label="Офис" value={scopeId} onChange={(e) => setScopeId(e.target.value)} required>
              <option value="">— выберите —</option>
              {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select>
          )}

          {scopeType === 'COUNTRY' && (
            <Select label="Страна" value={scopeId} onChange={(e) => setScopeId(e.target.value)} required>
              <option value="">— выберите —</option>
              {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}

          {scopeType === 'CITY' && (
            <>
              <Select label="Страна" value={countryForCity} onChange={onCountryForCityChange} required>
                <option value="">— выберите —</option>
                {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              {countryForCity && (
                <Select label="Город" value={scopeId} onChange={(e) => setScopeId(e.target.value)} required>
                  <option value="">— выберите —</option>
                  {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              )}
            </>
          )}

          <Input
            type="date"
            label="Истекает (опционально)"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />

          <div>
            <label className="block text-xs font-medium text-content-muted mb-1">Заметка (опционально)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm bg-surface-card border border-edge rounded-[var(--radius-sm)] focus:outline-none focus:border-brand-500"
              placeholder="Например: временный доступ на проект"
            />
          </div>

          {error && (
            <div className="bg-red-500/10 text-red-400 text-sm px-3 py-2 rounded-[var(--radius-sm)] border border-red-500/20">{error}</div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Закрыть</Button>
            <Button type="submit" loading={submitting}><Plus size={14} /> Выдать</Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
