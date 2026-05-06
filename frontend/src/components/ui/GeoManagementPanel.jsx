import { useMemo, useState } from 'react';
import { Plus, Globe, MapPin, ShieldCheck } from 'lucide-react';
import Card from './Card';
import Button from './Button';
import Input from './Input';
import Select from './Select';
import { usersApi } from '../../api/users';

export default function GeoManagementPanel({
  countries,
  offices,
  users,
  currentUser,
  onRefresh,
  onOpenAccessManager,
}) {
  const [savingCountry, setSavingCountry] = useState(false);
  const [savingCity, setSavingCity] = useState(false);
  const [errorCountry, setErrorCountry] = useState('');
  const [errorCity, setErrorCity] = useState('');

  const [countryForm, setCountryForm] = useState({
    name: '',
    code: '',
    officeId: '',
  });

  const [cityForm, setCityForm] = useState({
    countryId: '',
    name: '',
    slug: '',
  });

  const [selectedUserId, setSelectedUserId] = useState('');

  const activeUsers = useMemo(
    () => (users || []).filter((u) => u.isActive !== false),
    [users],
  );

  const selectedUser = useMemo(
    () => activeUsers.find((u) => u.id === selectedUserId) || null,
    [activeUsers, selectedUserId],
  );

  const onCreateCountry = async (e) => {
    e.preventDefault();
    setErrorCountry('');
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
    setSavingCity(true);
    try {
      const payload = {
        countryId: cityForm.countryId,
        name: cityForm.name.trim(),
      };
      if (cityForm.slug.trim()) {
        payload.slug = cityForm.slug.trim();
      }
      await usersApi.createCity(payload);
      setCityForm({ countryId: cityForm.countryId, name: '', slug: '' });
      await onRefresh();
    } catch (err) {
      setErrorCity(err.response?.data?.message || 'Не удалось создать город');
    } finally {
      setSavingCity(false);
    }
  };

  const openAccessForScope = (scopeType, scopeId, countryForCity = '') => {
    if (!selectedUser) {
      setErrorCity('Сначала выберите пользователя для выдачи доступа');
      return;
    }
    onOpenAccessManager(selectedUser, {
      initialScopeType: scopeType,
      initialScopeId: scopeId,
      initialCountryForCity: countryForCity,
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-content-muted mb-1">Пользователь для выдачи доступа</label>
            <Select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
              <option value="">— выберите пользователя —</option>
              {activeUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName || u.username} ({u.role})
                </option>
              ))}
            </Select>
            <div className="text-[11px] text-content-muted mt-1">
              Кнопки "Дать доступ" откроют менеджер доступов для выбранного пользователя.
            </div>
          </div>
          <div className="flex items-end">
            {selectedUser && (
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => onOpenAccessManager(selectedUser)}
              >
                <ShieldCheck size={16} /> Управление доступами выбранного пользователя
              </Button>
            )}
          </div>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <h3 className="font-semibold text-content-primary mb-3 flex items-center gap-2">
            <Globe size={18} className="text-brand-500" /> Новая страна
          </h3>
          <form onSubmit={onCreateCountry} className="space-y-3">
            <Input
              label="Название"
              value={countryForm.name}
              onChange={(e) => setCountryForm((p) => ({ ...p, name: e.target.value }))}
              required
            />
            <Input
              label="Код (например de, pl, nl)"
              value={countryForm.code}
              onChange={(e) => setCountryForm((p) => ({ ...p, code: e.target.value }))}
              required
            />
            {currentUser?.role === 'ADMIN' && (
              <Select
                label="Офис (опционально)"
                value={countryForm.officeId}
                onChange={(e) => setCountryForm((p) => ({ ...p, officeId: e.target.value }))}
              >
                <option value="">— без офиса —</option>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </Select>
            )}
            {errorCountry && <div className="text-sm text-red-400">{errorCountry}</div>}
            <Button type="submit" loading={savingCountry} className="w-full">
              <Plus size={16} /> Создать страну
            </Button>
          </form>
        </Card>

        <Card>
          <h3 className="font-semibold text-content-primary mb-3 flex items-center gap-2">
            <MapPin size={18} className="text-brand-500" /> Новый город
          </h3>
          <form onSubmit={onCreateCity} className="space-y-3">
            <Select
              label="Страна"
              value={cityForm.countryId}
              onChange={(e) => setCityForm((p) => ({ ...p, countryId: e.target.value }))}
              required
            >
              <option value="">— выберите —</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <Input
              label="Название города"
              value={cityForm.name}
              onChange={(e) => setCityForm((p) => ({ ...p, name: e.target.value }))}
              required
            />
            <Input
              label="Slug (опционально)"
              value={cityForm.slug}
              onChange={(e) => setCityForm((p) => ({ ...p, slug: e.target.value }))}
              placeholder="auto-from-name"
            />
            {errorCity && <div className="text-sm text-red-400">{errorCity}</div>}
            <Button type="submit" loading={savingCity} className="w-full">
              <Plus size={16} /> Создать город
            </Button>
          </form>
        </Card>
      </div>

      <Card>
        <h3 className="font-semibold text-content-primary mb-3">Страны и города</h3>
        <div className="space-y-3">
          {countries.map((country) => (
            <div key={country.id} className="border border-edge rounded-[var(--radius-sm)] p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div>
                  <div className="font-medium text-content-primary">{country.name} <span className="text-xs text-content-muted uppercase">({country.code})</span></div>
                  <div className="text-xs text-content-muted">Офис: {country.office?.name || '—'}</div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => openAccessForScope('COUNTRY', country.id)}
                >
                  <ShieldCheck size={14} /> Дать доступ к стране
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(country.cities || []).map((city) => (
                  <div key={city.id} className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-surface-secondary border border-edge text-xs text-content-primary">
                    <span>{city.name}</span>
                    <button
                      className="text-brand-500 hover:text-brand-400"
                      onClick={() => openAccessForScope('CITY', city.id, country.id)}
                      type="button"
                      title="Дать доступ к городу"
                    >
                      <ShieldCheck size={12} />
                    </button>
                  </div>
                ))}
                {(country.cities || []).length === 0 && (
                  <span className="text-xs text-content-muted">Городов пока нет</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
