import { useEffect, useState } from 'react';
import { Globe, Building2, Map as MapIcon, MapPin, Trash2, Plus, Info, CheckCircle2, Eye, Lock } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import { accessApi } from '../../api/access';
import { usersApi } from '../../api/users';

// ─── Constants ───────────────────────────────────────────────────────────────

const SCOPE_TYPES = [
  { value: 'CITY',    label: 'Город',      Icon: MapPin,    color: 'sky',    desc: 'Доступ к конкретному городу' },
  { value: 'COUNTRY', label: 'Страна',     Icon: MapIcon,   color: 'emerald',desc: 'Доступ ко всей стране' },
  { value: 'OFFICE',  label: 'Офис',       Icon: Building2, color: 'violet', desc: 'Доступ к офису / складу' },
  { value: 'GLOBAL',  label: 'Глобально',  Icon: Globe,     color: 'amber',  desc: 'Полный доступ без ограничений' },
];

const ACCESS_TYPES = [
  {
    value: 'FULL',
    label: 'Полный',
    Icon: CheckCircle2,
    color: 'emerald',
    desc: 'Переключение в контекст + отправки, приёмка, расходы, склад',
  },
  {
    value: 'PARTIAL',
    label: 'Ограниченный',
    Icon: Eye,
    color: 'amber',
    desc: 'Только создание расходов EXTERNAL. Без переключения контекста',
  },
];

const SCOPE_ICON = { GLOBAL: Globe, OFFICE: Building2, COUNTRY: MapIcon, CITY: MapPin };
const SCOPE_LABEL = { GLOBAL: 'Глобально', OFFICE: 'Офис', COUNTRY: 'Страна', CITY: 'Город' };

function fmtDate(value) {
  if (!value) return null;
  try { return new Date(value).toLocaleDateString('ru-RU'); } catch { return null; }
}

// ─── Component ───────────────────────────────────────────────────────────────

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
  const [citiesLoading, setCitiesLoading] = useState(false);
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
    if (!open || !initialCountryForCity || scopeType !== 'CITY') return;
    loadCitiesForCountry(initialCountryForCity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    setScopeId('');
    setCities([]);
    setCountryForCity('');
    if (scopeType === 'GLOBAL' || scopeType === 'OFFICE') setAccessType('FULL');
  }, [scopeType]);

  const loadCitiesForCountry = async (cid) => {
    if (!cid) { setCities([]); return; }
    setCitiesLoading(true);
    try {
      const { data } = await usersApi.getCities(cid);
      setCities(Array.isArray(data) ? data : (data?.data || data || []));
    } catch {
      setCities([]);
    } finally {
      setCitiesLoading(false);
    }
  };

  const handleCountryForCityChange = async (e) => {
    const cid = e.target.value;
    setCountryForCity(cid);
    setScopeId('');
    await loadCitiesForCountry(cid);
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
      setError(scopeType === 'CITY' && !countryForCity ? 'Сначала выберите страну, затем город' : 'Выберите цель доступа');
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

  const activeAccesses = accesses.filter(a => !a.revokedAt && !(a.expiresAt && new Date(a.expiresAt) < new Date()));
  const inactiveAccesses = accesses.filter(a => a.revokedAt || (a.expiresAt && new Date(a.expiresAt) < new Date()));

  return (
    <Modal open={open} onClose={onClose} title={`Доступы — ${user.displayName || user.username}`} wide>
      <div className="space-y-5">

        {/* ── Current accesses ───────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-content-primary">Текущие доступы</h3>
            {activeAccesses.length > 0 && (
              <span className="text-[11px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full font-medium">
                {activeAccesses.length} активн{activeAccesses.length === 1 ? 'ый' : 'ых'}
              </span>
            )}
          </div>

          {loading && <div className="text-xs text-content-muted py-2">Загрузка…</div>}

          {!loading && accesses.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-content-muted py-3 px-3 bg-surface-secondary rounded-lg">
              <Lock size={14} className="flex-shrink-0" />
              Нет дополнительных доступов — работает только в своём стандартном контексте
            </div>
          )}

          {!loading && activeAccesses.length > 0 && (
            <div className="space-y-1.5">
              {activeAccesses.map((a) => {
                const Icon = SCOPE_ICON[a.scopeType] ?? Globe;
                const name = a.target?.name ?? (a.scopeType === 'GLOBAL' ? 'Все подразделения' : '—');
                const isPartial = a.accessType === 'PARTIAL';
                return (
                  <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg border border-edge bg-surface-card">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isPartial ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                      <Icon size={15} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold text-content-primary">{name}</span>
                        <span className="text-[10px] text-content-muted">({SCOPE_LABEL[a.scopeType]})</span>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${isPartial ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                          {isPartial ? '👁 Ограниченный' : '✓ Полный'}
                        </span>
                      </div>
                      <div className="text-[11px] text-content-muted mt-0.5 flex items-center gap-2 flex-wrap">
                        {isPartial
                          ? 'Только расходы EXTERNAL — без переключения контекста'
                          : 'Полное управление: отправки, приёмка, расходы, склад'}
                        {a.expiresAt && <span className="text-amber-400">· истекает {fmtDate(a.expiresAt)}</span>}
                        {a.notes && <span className="italic">· {a.notes}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRevoke(a.id)}
                      className="p-1.5 rounded-[var(--radius-sm)] hover:bg-red-500/10 text-content-muted hover:text-red-500 flex-shrink-0"
                      title="Отозвать доступ"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && inactiveAccesses.length > 0 && (
            <details className="mt-2">
              <summary className="text-[11px] text-content-muted cursor-pointer select-none hover:text-content-secondary">
                Показать отозванные / истёкшие ({inactiveAccesses.length})
              </summary>
              <div className="space-y-1 mt-1.5">
                {inactiveAccesses.map((a) => {
                  const Icon = SCOPE_ICON[a.scopeType] ?? Globe;
                  const name = a.target?.name ?? (a.scopeType === 'GLOBAL' ? 'Все' : '—');
                  const isRevoked = !!a.revokedAt;
                  return (
                    <div key={a.id} className="flex items-center gap-2 p-2 rounded-lg border border-edge opacity-50">
                      <Icon size={14} className="text-content-muted flex-shrink-0" />
                      <span className="flex-1 min-w-0 text-[11px] text-content-muted truncate">
                        {name} · {SCOPE_LABEL[a.scopeType]} · {a.accessType === 'PARTIAL' ? 'ограниченный' : 'полный'}
                        {isRevoked ? ' · отозван' : ` · истёк ${fmtDate(a.expiresAt)}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </details>
          )}
        </div>

        {/* ── Grant new access ───────────────────────── */}
        <form onSubmit={handleGrant} className="border-t border-edge pt-5 space-y-4">
          <h3 className="text-sm font-semibold text-content-primary">Выдать новый доступ</h3>

          {/* Шаг 1 — тип области */}
          <div>
            <p className="text-xs font-medium text-content-muted mb-2">Шаг 1 — Тип области</p>
            <div className="grid grid-cols-2 gap-2">
              {SCOPE_TYPES.map(({ value, label, Icon, color, desc }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setScopeType(value)}
                  className={`flex items-start gap-2.5 p-3 rounded-xl border-2 text-left transition-all ${
                    scopeType === value ? `border-${color}-500 bg-${color}-500/10` : 'border-edge hover:border-brand-500/30'
                  }`}
                >
                  <div className={`mt-0.5 flex-shrink-0 ${scopeType === value ? `text-${color}-500` : 'text-content-muted'}`}>
                    <Icon size={16} />
                  </div>
                  <div>
                    <div className={`text-xs font-semibold ${scopeType === value ? `text-${color}-500` : 'text-content-primary'}`}>{label}</div>
                    <div className="text-[10px] text-content-muted leading-tight mt-0.5">{desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Шаг 2 — уровень (только для CITY/COUNTRY) */}
          {(scopeType === 'CITY' || scopeType === 'COUNTRY') && (
            <div>
              <p className="text-xs font-medium text-content-muted mb-2">Шаг 2 — Уровень доступа</p>
              <div className="grid grid-cols-2 gap-2">
                {ACCESS_TYPES.map(({ value, label, Icon, color, desc }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setAccessType(value)}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border-2 text-left transition-all ${
                      accessType === value ? `border-${color}-500 bg-${color}-500/10` : 'border-edge hover:border-brand-500/30'
                    }`}
                  >
                    <div className={`mt-0.5 flex-shrink-0 ${accessType === value ? `text-${color}-500` : 'text-content-muted'}`}>
                      <Icon size={16} />
                    </div>
                    <div>
                      <div className={`text-xs font-semibold ${accessType === value ? `text-${color}-500` : 'text-content-primary'}`}>{label}</div>
                      <div className="text-[10px] text-content-muted leading-tight mt-0.5">{desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Шаг 3 — выбор цели */}
          <div>
            <p className="text-xs font-medium text-content-muted mb-2">
              Шаг {scopeType === 'CITY' || scopeType === 'COUNTRY' ? '3' : '2'} — Выберите{' '}
              {scopeType === 'CITY' ? 'страну и город' : scopeType === 'COUNTRY' ? 'страну' : scopeType === 'OFFICE' ? 'офис' : 'область'}
            </p>

            {scopeType === 'GLOBAL' && (
              <div className="flex items-start gap-2 p-3 bg-amber-500/10 text-amber-400 rounded-lg text-xs">
                <Info size={14} className="flex-shrink-0 mt-0.5" />
                Глобальный доступ даёт полный контроль над всей системой без ограничений. Используйте осторожно.
              </div>
            )}

            {scopeType === 'OFFICE' && (
              <select
                value={scopeId}
                onChange={(e) => setScopeId(e.target.value)}
                className="w-full rounded-[var(--radius-sm)] border border-edge text-sm px-3 py-2 bg-surface-card text-content-primary focus:border-brand-500 focus:outline-none"
                required
              >
                <option value="">— Выберите офис —</option>
                {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            )}

            {scopeType === 'COUNTRY' && (
              <select
                value={scopeId}
                onChange={(e) => setScopeId(e.target.value)}
                className="w-full rounded-[var(--radius-sm)] border border-edge text-sm px-3 py-2 bg-surface-card text-content-primary focus:border-brand-500 focus:outline-none"
                required
              >
                <option value="">— Выберите страну —</option>
                {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}

            {scopeType === 'CITY' && (
              <div className="space-y-2">
                <select
                  value={countryForCity}
                  onChange={handleCountryForCityChange}
                  className="w-full rounded-[var(--radius-sm)] border border-edge text-sm px-3 py-2 bg-surface-card text-content-primary focus:border-brand-500 focus:outline-none"
                >
                  <option value="">1. Выберите страну →</option>
                  {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>

                {countryForCity ? (
                  <select
                    value={scopeId}
                    onChange={(e) => setScopeId(e.target.value)}
                    className="w-full rounded-[var(--radius-sm)] border border-edge text-sm px-3 py-2 bg-surface-card text-content-primary focus:border-brand-500 focus:outline-none"
                    required
                    disabled={citiesLoading}
                  >
                    <option value="">
                      {citiesLoading ? 'Загрузка городов...' : `2. Выберите город${cities.length ? ` (${cities.length})` : ''} →`}
                    </option>
                    {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                ) : (
                  <p className="text-[11px] text-content-muted flex items-center gap-1">
                    <Info size={11} /> После выбора страны появится список городов
                  </p>
                )}

                {scopeId && (
                  <p className="text-[11px] text-content-muted flex items-center gap-1">
                    <Info size={11} /> Чтобы дать доступ к нескольким городам — добавляйте их по одному
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Необязательные поля */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-content-muted mb-1">Истекает (необязательно)</label>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full rounded-[var(--radius-sm)] border border-edge text-sm px-3 py-2 bg-surface-card text-content-primary focus:border-brand-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-content-muted mb-1">Заметка (необязательно)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Временный, для проекта..."
                className="w-full rounded-[var(--radius-sm)] border border-edge text-sm px-3 py-2 bg-surface-card text-content-primary focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 text-red-400 text-sm px-3 py-2 rounded-[var(--radius-sm)] border border-red-500/20">{error}</div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>Закрыть</Button>
            <Button type="submit" loading={submitting}>
              <Plus size={14} /> Выдать доступ
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
