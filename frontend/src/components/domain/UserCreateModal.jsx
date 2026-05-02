import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import { listCountries } from '../../api/countries';
import { listCities } from '../../api/cities';
import { createUser, ROLE_META } from '../../api/users';

const ROLES = ['ADMIN', 'OFFICE', 'COUNTRY', 'MANAGER'];

// Default scope for each role
function defaultAccessForRole(role) {
  if (role === 'ADMIN' || role === 'OFFICE') return { scope: 'GLOBAL' };
  if (role === 'COUNTRY') return { scope: 'COUNTRY', countryId: '' };
  return { scope: 'CITY', cityId: '' };
}

export default function UserCreateModal({ open, onClose, onDone }) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('MANAGER');
  const [access, setAccess] = useState(defaultAccessForRole('MANAGER'));
  const [countries, setCountries] = useState([]);
  const [cities, setCities] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setUsername('');
    setDisplayName('');
    setPassword('');
    setRole('MANAGER');
    setAccess(defaultAccessForRole('MANAGER'));
    Promise.all([listCountries(), listCities()])
      .then(([co, ci]) => {
        setCountries(co || []);
        setCities(ci || []);
      })
      .catch(() => {});
  }, [open]);

  function changeRole(r) {
    setRole(r);
    setAccess(defaultAccessForRole(r));
  }

  async function submit() {
    setError(null);
    if (!username.trim() || username.trim().length < 2) return setError('Логин слишком короткий');
    if (!displayName.trim()) return setError('Введите имя');
    if (password.length < 6) return setError('Пароль ≥ 6 символов');
    if (access.scope === 'COUNTRY' && !access.countryId) return setError('Выберите страну');
    if (access.scope === 'CITY' && !access.cityId) return setError('Выберите город');

    setSubmitting(true);
    try {
      await createUser({
        username: username.trim(),
        displayName: displayName.trim(),
        password,
        role,
        accesses: [access],
      });
      onDone?.();
      onClose?.();
    } catch (e) {
      setError(e?.response?.data?.error?.message || 'CREATE_FAILED');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Новый сотрудник"
      size="lg"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            Отмена
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Создаём…' : 'Создать'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Логин</label>
            <input className="input mono" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div>
            <label className="label">Имя</label>
            <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label">Пароль</label>
          <input
            className="input mono"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="минимум 6 символов"
          />
        </div>

        <div>
          <label className="label">Роль</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {ROLES.map((r) => {
              const m = ROLE_META[r];
              const active = role === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => changeRole(r)}
                  className="px-3 py-2 rounded-[10px] text-sm transition-colors"
                  style={{
                    background: active ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--surface-2)',
                    color: active ? 'var(--accent)' : 'var(--text-2)',
                    border: '1px solid',
                    borderColor: active ? 'var(--accent)' : 'var(--border)',
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {(role === 'COUNTRY') && (
          <div>
            <label className="label">Страна</label>
            <select
              className="select"
              value={access.countryId || ''}
              onChange={(e) => setAccess({ scope: 'COUNTRY', countryId: e.target.value })}
            >
              <option value="">— выберите —</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>
        )}

        {(role === 'MANAGER') && (
          <div>
            <label className="label">Город</label>
            <select
              className="select"
              value={access.cityId || ''}
              onChange={(e) => setAccess({ scope: 'CITY', cityId: e.target.value })}
            >
              <option value="">— выберите —</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.country?.code || c.countryCode || '—'})
                </option>
              ))}
            </select>
          </div>
        )}

        {(role === 'ADMIN' || role === 'OFFICE') && (
          <div className="text-xs text-text-3">
            Эта роль имеет глобальный доступ ко всем странам и городам.
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
