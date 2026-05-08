import { useMemo, useState } from 'react';
import { Plus, Globe, MapPin, ShieldCheck, ChevronDown, ChevronRight, X, Check, UserPlus } from 'lucide-react';
import Button from './Button';
import Input from './Input';
import Select from './Select';
import Modal from './Modal';
import { usersApi } from '../../api/users';

const ROLE_LABELS = { ADMIN: 'Админ', OFFICE: 'Офис', COUNTRY: 'Страна', CITY: 'Город' };

export default function GeoManagementPanel({
  countries,
  offices,
  users,
  currentUser,
  onRefresh,
  onOpenAccessManager,
}) {
  const [showCountryForm, setShowCountryForm] = useState(false);
  const [showCityForm, setShowCityForm] = useState(false);

  const [savingCountry, setSavingCountry] = useState(false);
  const [errorCountry, setErrorCountry] = useState('');
  const [successCountry, setSuccessCountry] = useState('');
  const [countryForm, setCountryForm] = useState({ name: '', code: '', officeId: '' });

  const [savingCity, setSavingCity] = useState(false);
  const [errorCity, setErrorCity] = useState('');
  const [successCity, setSuccessCity] = useState('');
  const [cityForm, setCityForm] = useState({ countryId: '', name: '', slug: '' });

  const [expandedCountries, setExpandedCountries] = useState({});

  const [accessPicker, setAccessPicker] = useState(null);
  const [accessPickerUserId, setAccessPickerUserId] = useState('');

  const activeUsers = useMemo(
    () => (users || []).filter((u) => u.isActive !== false),
    [users],
  );

  const toggleCountry = (id) =>
    setExpandedCountries((p) => ({ ...p, [id]: !p[id] }));

  const onCreateCountry = async (e) => {
    e.preventDefault();
    setErrorCountry('');
    setSuccessCountry('');
    setSavingCountry(true);
    try {
      const payload = {
        name: countryForm.name.trim(),
        code: countryForm.code.trim().toLowerCase(),
      };
      if (currentUser?.role === 'ADMIN' && countryForm.officeId) {
        payload.officeId = countryForm.officeId;
      }
      await usersApi.createCountry(payload);
      setCountryForm({ name: '', code: '', officeId: '' });
      setSuccessCountry(`Страна "${payload.name}" создана`);
      setTimeout(() => { setSuccessCountry(''); setShowCountryForm(false); }, 2000);
      await onRefresh();
    } catch (err) {
      setErrorCountry(err.response?.data?.message || 'Не удалось создать страну');
    } finally {
      setSavingCountry(false);
    }
  };

  const onCreateCity = async (e) => {
    e.preventDefault();
    setErrorCity('');
    setSuccessCity('');
    setSavingCity(true);
    try {
      const payload = { countryId: cityForm.countryId, name: cityForm.name.trim() };
      if (cityForm.slug.trim()) payload.slug = cityForm.slug.trim();
      await usersApi.createCity(payload);
      setCityForm((p) => ({ ...p, name: '', slug: '' }));
      setSuccessCity(`Город "${payload.name}" создан`);
      setTimeout(() => { setSuccessCity(''); setShowCityForm(false); }, 2000);
      await onRefresh();
    } catch (err) {
      setErrorCity(err.response?.data?.message || 'Не удалось создать город');
    } finally {
      setSavingCity(false);
    }
  };

  const openAccessPicker = (scopeType, scopeId, countryForCity, label) => {
    setAccessPicker({ scopeType, scopeId, countryForCity, label });
    setAccessPickerUserId('');
  };

  const confirmAccess = () => {
    if (!accessPickerUserId) return;
    const user = activeUsers.find((u) => u.id === accessPickerUserId);
    if (!user) return;
    onOpenAccessManager(user, {
      initialScopeType: accessPicker.scopeType,
      initialScopeId: accessPicker.scopeId,
      initialCountryForCity: accessPicker.countryForCity,
    });
    setAccessPicker(null);
  };

  return (
    <div className="space-y-4">

      {/* Action buttons */}
      <div className="flex gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => { setShowCountryForm((p) => !p); setShowCityForm(false); }}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
            showCountryForm
              ? 'bg-brand-600 text-white border-brand-600 shadow-md shadow-brand-500/20'
              : 'bg-surface-card text-content-secondary border-edge hover:border-brand-500 hover:text-brand-500'
          }`}
        >
          <Globe size={16} />
          {showCountryForm ? 'Скрыть форму' : '+ Новая страна'}
        </button>
        <button
          type="button"
          onClick={() => { setShowCityForm((p) => !p); setShowCountryForm(false); }}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
            showCityForm
              ? 'bg-brand-600 text-white border-brand-600 shadow-md shadow-brand-500/20'
              : 'bg-surface-card text-content-secondary border-edge hover:border-brand-500 hover:text-brand-500'
          }`}
        >
          <MapPin size={16} />
          {showCityForm ? 'Скрыть форму' : '+ Новый город'}
        </button>
      </div>

      {/* Create country form */}
      {showCountryForm && (
        <div className="bg-surface-card rounded-xl border border-brand-500/30 p-5 shadow-md">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-content-primary flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center">
                <Globe size={16} className="text-brand-500" />
              </div>
              Новая страна
            </h3>
            <button
              type="button"
              onClick={() => setShowCountryForm(false)}
              className="p-1.5 rounded-lg hover:bg-surface-card-hover text-content-muted hover:text-content-primary"
            >
              <X size={16} />
            </button>
          </div>
          <form onSubmit={onCreateCountry} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <Input
                label="Название страны"
                value={countryForm.name}
                onChange={(e) => setCountryForm((p) => ({ ...p, name: e.target.value }))}
                required
                placeholder="например Нидерланды"
              />
              <Input
                label="Код (2–3 буквы)"
                value={countryForm.code}
                onChange={(e) => setCountryForm((p) => ({ ...p, code: e.target.value }))}
                required
                placeholder="nl, de, pl…"
                maxLength={3}
              />
            </div>
            {currentUser?.role === 'ADMIN' && (
              <Select
                label="Привязать к офису (необязательно)"
                value={countryForm.officeId}
                onChange={(e) => setCountryForm((p) => ({ ...p, officeId: e.target.value }))}
              >
                <option value="">— без офиса —</option>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </Select>
            )}
            {errorCountry && (
              <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">
                <X size={14} /> {errorCountry}
              </div>
            )}
            {successCountry && (
              <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 px-3 py-2 rounded-lg">
                <Check size={14} /> {successCountry}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="ghost" onClick={() => setShowCountryForm(false)}>
                Отмена
              </Button>
              <Button type="submit" loading={savingCountry}>
                <Plus size={15} /> Создать страну
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Create city form */}
      {showCityForm && (
        <div className="bg-surface-card rounded-xl border border-brand-500/30 p-5 shadow-md">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-content-primary flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <MapPin size={16} className="text-emerald-500" />
              </div>
              Новый город
            </h3>
            <button
              type="button"
              onClick={() => setShowCityForm(false)}
              className="p-1.5 rounded-lg hover:bg-surface-card-hover text-content-muted hover:text-content-primary"
            >
              <X size={16} />
            </button>
          </div>
          <form onSubmit={onCreateCity} className="space-y-4">
            <Select
              label="Страна"
              value={cityForm.countryId}
              onChange={(e) => setCityForm((p) => ({ ...p, countryId: e.target.value }))}
              required
            >
              <option value="">— выберите страну —</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <div className="grid sm:grid-cols-2 gap-3">
              <Input
                label="Название города"
                value={cityForm.name}
                onChange={(e) => setCityForm((p) => ({ ...p, name: e.target.value }))}
                required
                placeholder="например Амстердам"
              />
              <Input
                label="Slug (необязательно)"
                value={cityForm.slug}
                onChange={(e) => setCityForm((p) => ({ ...p, slug: e.target.value }))}
                placeholder="amsterdam"
              />
            </div>
            {errorCity && (
              <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">
                <X size={14} /> {errorCity}
              </div>
            )}
            {successCity && (
              <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 px-3 py-2 rounded-lg">
                <Check size={14} /> {successCity}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="ghost" onClick={() => setShowCityForm(false)}>
                Отмена
              </Button>
              <Button type="submit" loading={savingCity}>
                <Plus size={15} /> Создать город
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Countries list */}
      <div className="space-y-2">
        {countries.length === 0 ? (
          <div className="text-center py-16 text-content-muted">
            <Globe size={44} className="mx-auto mb-3 opacity-20" />
            <p className="font-medium">Стран пока нет</p>
            <p className="text-sm mt-1">Нажмите «+ Новая страна» чтобы добавить</p>
          </div>
        ) : (
          countries.map((country) => {
            const isExpanded = !!expandedCountries[country.id];
            const cityCount = (country.cities || []).length;
            return (
              <div key={country.id} className="bg-surface-card rounded-xl border border-edge overflow-hidden">
                <div
                  className="flex items-center justify-between px-4 py-3.5 cursor-pointer hover:bg-surface-card-hover transition-colors select-none"
                  onClick={() => toggleCountry(country.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/15 to-brand-600/10 flex items-center justify-center flex-shrink-0">
                      <Globe size={17} className="text-brand-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-content-primary">{country.name}</span>
                        <span className="text-[10px] font-mono text-content-muted uppercase bg-surface-secondary px-1.5 py-0.5 rounded">
                          {country.code}
                        </span>
                      </div>
                      <div className="text-xs text-content-muted mt-0.5">
                        {cityCount === 0 ? 'Городов нет' : `${cityCount} ${cityCount === 1 ? 'город' : cityCount < 5 ? 'города' : 'городов'}`}
                        {country.office ? ` · ${country.office.name}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openAccessPicker('COUNTRY', country.id, '', country.name);
                      }}
                      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition-colors font-medium"
                    >
                      <UserPlus size={13} /> Назначить доступ
                    </button>
                    {isExpanded
                      ? <ChevronDown size={16} className="text-content-muted" />
                      : <ChevronRight size={16} className="text-content-muted" />
                    }
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-edge bg-surface-secondary/30 px-4 py-3">
                    {cityCount === 0 ? (
                      <div className="text-center py-4 text-xs text-content-muted">
                        <MapPin size={22} className="mx-auto mb-1.5 opacity-30" />
                        Городов нет — добавьте через кнопку «+ Новый город»
                      </div>
                    ) : (
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {country.cities.map((city) => (
                          <div
                            key={city.id}
                            className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-surface-card border border-edge"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <MapPin size={13} className="text-emerald-400 flex-shrink-0" />
                              <span className="text-sm text-content-primary font-medium truncate">{city.name}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => openAccessPicker('CITY', city.id, country.id, city.name)}
                              className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors font-medium flex-shrink-0"
                            >
                              <UserPlus size={11} /> Доступ
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Access picker modal */}
      <Modal
        open={!!accessPicker}
        onClose={() => setAccessPicker(null)}
        title={`Доступ: ${accessPicker?.label || ''}`}
      >
        {accessPicker && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 p-3 bg-surface-secondary rounded-xl">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                accessPicker.scopeType === 'COUNTRY' ? 'bg-brand-500/10' : 'bg-emerald-500/10'
              }`}>
                {accessPicker.scopeType === 'COUNTRY'
                  ? <Globe size={18} className="text-brand-400" />
                  : <MapPin size={18} className="text-emerald-400" />
                }
              </div>
              <div>
                <div className="font-semibold text-content-primary">{accessPicker.label}</div>
                <div className="text-xs text-content-muted">
                  {accessPicker.scopeType === 'COUNTRY' ? 'Страна' : 'Город'}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-content-secondary mb-2">
                Кому выдать доступ?
              </label>
              <Select
                value={accessPickerUserId}
                onChange={(e) => setAccessPickerUserId(e.target.value)}
              >
                <option value="">— выберите пользователя —</option>
                {activeUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName || u.username} · {ROLE_LABELS[u.role] || u.role}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-content-muted mt-1.5">
                После выбора откроется менеджер доступов для настройки типа и уровня прав
              </p>
            </div>

            {accessPickerUserId && (() => {
              const u = activeUsers.find((x) => x.id === accessPickerUserId);
              if (!u) return null;
              return (
                <div className="flex items-center gap-3 p-3 bg-surface-card rounded-xl border border-edge">
                  <div className="w-9 h-9 rounded-full bg-brand-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-brand-400">
                      {(u.displayName || u.username).slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-content-primary">{u.displayName || u.username}</div>
                    <div className="text-xs text-content-muted">@{u.username} · {ROLE_LABELS[u.role] || u.role}</div>
                  </div>
                </div>
              );
            })()}

            <div className="flex gap-2 pt-1">
              <Button variant="ghost" className="flex-1" onClick={() => setAccessPicker(null)}>
                Отмена
              </Button>
              <Button
                className="flex-1"
                disabled={!accessPickerUserId}
                onClick={confirmAccess}
              >
                <ShieldCheck size={16} /> Настроить доступ
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
