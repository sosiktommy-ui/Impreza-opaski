import { useEffect, useState } from 'react';
import { Globe, Building2, Map as MapIcon, MapPin, Trash2, Plus, Info, CheckCircle2, Eye, Lock } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import { accessApi } from '../../api/access';
import { usersApi } from '../../api/users';

// в”Ђв”Ђв”Ђ Constants в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

const SCOPE_TYPES = [
  { value: 'CITY',    label: 'Р“РѕСЂРѕРґ',      Icon: MapPin,    color: 'sky',    desc: 'Р”РѕСЃС‚СѓРї Рє РєРѕРЅРєСЂРµС‚РЅРѕРјСѓ РіРѕСЂРѕРґСѓ' },
  { value: 'COUNTRY', label: 'РЎС‚СЂР°РЅР°',     Icon: MapIcon,   color: 'emerald',desc: 'Р”РѕСЃС‚СѓРї РєРѕ РІСЃРµР№ СЃС‚СЂР°РЅРµ' },
  { value: 'OFFICE',  label: 'РћС„РёСЃ',       Icon: Building2, color: 'violet', desc: 'Р”РѕСЃС‚СѓРї Рє РѕС„РёСЃСѓ / СЃРєР»Р°РґСѓ' },
  { value: 'GLOBAL',  label: 'Р“Р»РѕР±Р°Р»СЊРЅРѕ',  Icon: Globe,     color: 'amber',  desc: 'РџРѕР»РЅС‹Р№ РґРѕСЃС‚СѓРї Р±РµР· РѕРіСЂР°РЅРёС‡РµРЅРёР№' },
];

const ACCESS_TYPES = [
  {
    value: 'FULL',
    label: 'РџРѕР»РЅС‹Р№',
    Icon: CheckCircle2,
    color: 'emerald',
    desc: 'РџРµСЂРµРєР»СЋС‡РµРЅРёРµ РІ РєРѕРЅС‚РµРєСЃС‚ + РѕС‚РїСЂР°РІРєРё, РїСЂРёС‘РјРєР°, СЂР°СЃС…РѕРґС‹, СЃРєР»Р°Рґ',
  },
  {
    value: 'PARTIAL',
    label: 'РћРіСЂР°РЅРёС‡РµРЅРЅС‹Р№',
    Icon: Eye,
    color: 'amber',
    desc: 'РўРѕР»СЊРєРѕ СЃРѕР·РґР°РЅРёРµ СЂР°СЃС…РѕРґРѕРІ EXTERNAL. Р‘РµР· РїРµСЂРµРєР»СЋС‡РµРЅРёСЏ РєРѕРЅС‚РµРєСЃС‚Р°',
  },
];

const SCOPE_ICON = { GLOBAL: Globe, OFFICE: Building2, COUNTRY: MapIcon, CITY: MapPin };
const SCOPE_LABEL = { GLOBAL: 'Р“Р»РѕР±Р°Р»СЊРЅРѕ', OFFICE: 'РћС„РёСЃ', COUNTRY: 'РЎС‚СЂР°РЅР°', CITY: 'Р“РѕСЂРѕРґ' };

function fmtDate(value) {
  if (!value) return null;
  try { return new Date(value).toLocaleDateString('ru-RU'); } catch { return null; }
}

// в”Ђв”Ђв”Ђ Component в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

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
      setError(err.response?.data?.message || 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РґРѕСЃС‚СѓРїС‹');
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
    if (!confirm('РћС‚РѕР·РІР°С‚СЊ СЌС‚РѕС‚ РґРѕСЃС‚СѓРї?')) return;
    try {
      await accessApi.revoke(id);
      await reload();
    } catch (err) {
      setError(err.response?.data?.message || 'РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РѕР·РІР°С‚СЊ');
    }
  };

  const handleGrant = async (e) => {
    e.preventDefault();
    setError('');
    if (scopeType !== 'GLOBAL' && !scopeId) {
      setError(scopeType === 'CITY' && !countryForCity ? 'РЎРЅР°С‡Р°Р»Р° РІС‹Р±РµСЂРёС‚Рµ СЃС‚СЂР°РЅСѓ, Р·Р°С‚РµРј РіРѕСЂРѕРґ' : 'Р’С‹Р±РµСЂРёС‚Рµ С†РµР»СЊ РґРѕСЃС‚СѓРїР°');
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
      setError(err.response?.data?.message || 'РќРµ СѓРґР°Р»РѕСЃСЊ РІС‹РґР°С‚СЊ РґРѕСЃС‚СѓРї');
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return null;

  const activeAccesses = accesses.filter(a => !a.revokedAt && !(a.expiresAt && new Date(a.expiresAt) < new Date()));
  const inactiveAccesses = accesses.filter(a => a.revokedAt || (a.expiresAt && new Date(a.expiresAt) < new Date()));

  return (
    <Modal open={open} onClose={onClose} title={`Р”РѕСЃС‚СѓРїС‹ вЂ” ${user.displayName || user.username}`} wide>
      <div className="space-y-5">

        {/* в”Ђв”Ђ Current accesses в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-content-primary">РўРµРєСѓС‰РёРµ РґРѕСЃС‚СѓРїС‹</h3>
            {activeAccesses.length > 0 && (
              <span className="text-[11px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full font-medium">
                {activeAccesses.length} Р°РєС‚РёРІРЅ{activeAccesses.length === 1 ? 'С‹Р№' : 'С‹С…'}
              </span>
            )}
          </div>

          {loading && <div className="text-xs text-content-muted py-2">Р—Р°РіСЂСѓР·РєР°вЂ¦</div>}

          {!loading && accesses.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-content-muted py-3 px-3 bg-surface-secondary rounded-lg">
              <Lock size={14} className="flex-shrink-0" />
              РќРµС‚ РґРѕРїРѕР»РЅРёС‚РµР»СЊРЅС‹С… РґРѕСЃС‚СѓРїРѕРІ вЂ” СЂР°Р±РѕС‚Р°РµС‚ С‚РѕР»СЊРєРѕ РІ СЃРІРѕС‘Рј СЃС‚Р°РЅРґР°СЂС‚РЅРѕРј РєРѕРЅС‚РµРєСЃС‚Рµ
            </div>
          )}

          {!loading && activeAccesses.length > 0 && (
            <div className="space-y-1.5">
              {activeAccesses.map((a) => {
                const Icon = SCOPE_ICON[a.scopeType] ?? Globe;
                const name = a.target?.name ?? (a.scopeType === 'GLOBAL' ? 'Р’СЃРµ РїРѕРґСЂР°Р·РґРµР»РµРЅРёСЏ' : 'вЂ”');
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
                          {isPartial ? 'рџ‘Ѓ РћРіСЂР°РЅРёС‡РµРЅРЅС‹Р№' : 'вњ“ РџРѕР»РЅС‹Р№'}
                        </span>
                      </div>
                      <div className="text-[11px] text-content-muted mt-0.5 flex items-center gap-2 flex-wrap">
                        {isPartial
                          ? 'РўРѕР»СЊРєРѕ СЂР°СЃС…РѕРґС‹ EXTERNAL вЂ” Р±РµР· РїРµСЂРµРєР»СЋС‡РµРЅРёСЏ РєРѕРЅС‚РµРєСЃС‚Р°'
                          : 'РџРѕР»РЅРѕРµ СѓРїСЂР°РІР»РµРЅРёРµ: РѕС‚РїСЂР°РІРєРё, РїСЂРёС‘РјРєР°, СЂР°СЃС…РѕРґС‹, СЃРєР»Р°Рґ'}
                        {a.expiresAt && <span className="text-amber-400">В· РёСЃС‚РµРєР°РµС‚ {fmtDate(a.expiresAt)}</span>}
                        {a.notes && <span className="italic">В· {a.notes}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRevoke(a.id)}
                      className="p-1.5 rounded-[var(--radius-sm)] hover:bg-red-500/10 text-content-muted hover:text-red-500 flex-shrink-0"
                      title="РћС‚РѕР·РІР°С‚СЊ РґРѕСЃС‚СѓРї"
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
                РџРѕРєР°Р·Р°С‚СЊ РѕС‚РѕР·РІР°РЅРЅС‹Рµ / РёСЃС‚С‘РєС€РёРµ ({inactiveAccesses.length})
              </summary>
              <div className="space-y-1 mt-1.5">
                {inactiveAccesses.map((a) => {
                  const Icon = SCOPE_ICON[a.scopeType] ?? Globe;
                  const name = a.target?.name ?? (a.scopeType === 'GLOBAL' ? 'Р’СЃРµ' : 'вЂ”');
                  const isRevoked = !!a.revokedAt;
                  return (
                    <div key={a.id} className="flex items-center gap-2 p-2 rounded-lg border border-edge opacity-50">
                      <Icon size={14} className="text-content-muted flex-shrink-0" />
                      <span className="flex-1 min-w-0 text-[11px] text-content-muted truncate">
                        {name} В· {SCOPE_LABEL[a.scopeType]} В· {a.accessType === 'PARTIAL' ? 'РѕРіСЂР°РЅРёС‡РµРЅРЅС‹Р№' : 'РїРѕР»РЅС‹Р№'}
                        {isRevoked ? ' В· РѕС‚РѕР·РІР°РЅ' : ` В· РёСЃС‚С‘Рє ${fmtDate(a.expiresAt)}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </details>
          )}
        </div>

        {/* в”Ђв”Ђ Grant new access в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */}
        <form onSubmit={handleGrant} className="border-t border-edge pt-5 space-y-4">
          <h3 className="text-sm font-semibold text-content-primary">Р’С‹РґР°С‚СЊ РЅРѕРІС‹Р№ РґРѕСЃС‚СѓРї</h3>

          {/* РЁР°Рі 1 вЂ” С‚РёРї РѕР±Р»Р°СЃС‚Рё */}
          <div>
            <p className="text-xs font-medium text-content-muted mb-2">РЁР°Рі 1 вЂ” РўРёРї РѕР±Р»Р°СЃС‚Рё</p>
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

          {/* РЁР°Рі 2 вЂ” СѓСЂРѕРІРµРЅСЊ (С‚РѕР»СЊРєРѕ РґР»СЏ CITY/COUNTRY) */}
          {(scopeType === 'CITY' || scopeType === 'COUNTRY') && (
            <div>
              <p className="text-xs font-medium text-content-muted mb-2">РЁР°Рі 2 вЂ” РЈСЂРѕРІРµРЅСЊ РґРѕСЃС‚СѓРїР°</p>
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

          {/* РЁР°Рі 3 вЂ” РІС‹Р±РѕСЂ С†РµР»Рё */}
          <div>
            <p className="text-xs font-medium text-content-muted mb-2">
              РЁР°Рі {scopeType === 'CITY' || scopeType === 'COUNTRY' ? '3' : '2'} вЂ” Р’С‹Р±РµСЂРёС‚Рµ{' '}
              {scopeType === 'CITY' ? 'СЃС‚СЂР°РЅСѓ Рё РіРѕСЂРѕРґ' : scopeType === 'COUNTRY' ? 'СЃС‚СЂР°РЅСѓ' : scopeType === 'OFFICE' ? 'РѕС„РёСЃ' : 'РѕР±Р»Р°СЃС‚СЊ'}
            </p>

            {scopeType === 'GLOBAL' && (
              <div className="flex items-start gap-2 p-3 bg-amber-500/10 text-amber-400 rounded-lg text-xs">
                <Info size={14} className="flex-shrink-0 mt-0.5" />
                Р“Р»РѕР±Р°Р»СЊРЅС‹Р№ РґРѕСЃС‚СѓРї РґР°С‘С‚ РїРѕР»РЅС‹Р№ РєРѕРЅС‚СЂРѕР»СЊ РЅР°Рґ РІСЃРµР№ СЃРёСЃС‚РµРјРѕР№ Р±РµР· РѕРіСЂР°РЅРёС‡РµРЅРёР№. РСЃРїРѕР»СЊР·СѓР№С‚Рµ РѕСЃС‚РѕСЂРѕР¶РЅРѕ.
              </div>
            )}

            {scopeType === 'OFFICE' && (
              <select
                value={scopeId}
                onChange={(e) => setScopeId(e.target.value)}
                className="w-full rounded-[var(--radius-sm)] border border-edge text-sm px-3 py-2 bg-surface-card text-content-primary focus:border-brand-500 focus:outline-none"
                required
              >
                <option value="">вЂ” Р’С‹Р±РµСЂРёС‚Рµ РѕС„РёСЃ вЂ”</option>
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
                <option value="">вЂ” Р’С‹Р±РµСЂРёС‚Рµ СЃС‚СЂР°РЅСѓ вЂ”</option>
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
                  <option value="">1. Р’С‹Р±РµСЂРёС‚Рµ СЃС‚СЂР°РЅСѓ в†’</option>
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
                      {citiesLoading ? 'Р—Р°РіСЂСѓР·РєР° РіРѕСЂРѕРґРѕРІ...' : `2. Р’С‹Р±РµСЂРёС‚Рµ РіРѕСЂРѕРґ${cities.length ? ` (${cities.length})` : ''} в†’`}
                    </option>
                    {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                ) : (
                  <p className="text-[11px] text-content-muted flex items-center gap-1">
                    <Info size={11} /> РџРѕСЃР»Рµ РІС‹Р±РѕСЂР° СЃС‚СЂР°РЅС‹ РїРѕСЏРІРёС‚СЃСЏ СЃРїРёСЃРѕРє РіРѕСЂРѕРґРѕРІ
                  </p>
                )}

                {scopeId && (
                  <p className="text-[11px] text-content-muted flex items-center gap-1">
                    <Info size={11} /> Р§С‚РѕР±С‹ РґР°С‚СЊ РґРѕСЃС‚СѓРї Рє РЅРµСЃРєРѕР»СЊРєРёРј РіРѕСЂРѕРґР°Рј вЂ” РґРѕР±Р°РІР»СЏР№С‚Рµ РёС… РїРѕ РѕРґРЅРѕРјСѓ
                  </p>
                )}
              </div>
            )}
          </div>

          {/* РќРµРѕР±СЏР·Р°С‚РµР»СЊРЅС‹Рµ РїРѕР»СЏ */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-content-muted mb-1">РСЃС‚РµРєР°РµС‚ (РЅРµРѕР±СЏР·Р°С‚РµР»СЊРЅРѕ)</label>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full rounded-[var(--radius-sm)] border border-edge text-sm px-3 py-2 bg-surface-card text-content-primary focus:border-brand-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-content-muted mb-1">Р—Р°РјРµС‚РєР° (РЅРµРѕР±СЏР·Р°С‚РµР»СЊРЅРѕ)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Р’СЂРµРјРµРЅРЅС‹Р№, РґР»СЏ РїСЂРѕРµРєС‚Р°..."
                className="w-full rounded-[var(--radius-sm)] border border-edge text-sm px-3 py-2 bg-surface-card text-content-primary focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 text-red-400 text-sm px-3 py-2 rounded-[var(--radius-sm)] border border-red-500/20">{error}</div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>Р—Р°РєСЂС‹С‚СЊ</Button>
            <Button type="submit" loading={submitting}>
              <Plus size={14} /> Р’С‹РґР°С‚СЊ РґРѕСЃС‚СѓРї
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
