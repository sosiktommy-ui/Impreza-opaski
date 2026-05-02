import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import { updateUser, resetUserPassword, deleteUser, ROLE_META } from '../../api/users';

const ROLES = ['ADMIN', 'OFFICE', 'COUNTRY', 'MANAGER'];

export default function UserEditModal({ open, onClose, onDone, user, isAdmin }) {
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('MANAGER');
  const [isActive, setIsActive] = useState(true);
  const [newPassword, setNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user || !open) return;
    setError(null);
    setDisplayName(user.displayName || '');
    setRole(user.role || 'MANAGER');
    setIsActive(user.isActive);
    setNewPassword('');
  }, [user, open]);

  if (!user) return null;

  async function save() {
    setError(null);
    setSubmitting(true);
    try {
      await updateUser(user.id, {
        displayName: displayName.trim() || undefined,
        role,
        isActive,
      });
      if (newPassword && newPassword.length >= 6) {
        await resetUserPassword(user.id, newPassword);
      }
      onDone?.();
      onClose?.();
    } catch (e) {
      setError(e?.response?.data?.error?.message || 'UPDATE_FAILED');
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete() {
    if (!confirm(`Удалить пользователя ${user.username}?`)) return;
    setSubmitting(true);
    try {
      await deleteUser(user.id);
      onDone?.();
      onClose?.();
    } catch (e) {
      setError(e?.response?.data?.error?.message || 'DELETE_FAILED');
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Сотрудник: ${user.displayName || user.username}`}
      size="md"
      footer={
        <>
          {isAdmin && (
            <button
              className="btn btn-ghost"
              onClick={onDelete}
              disabled={submitting}
              style={{ color: 'var(--danger)', marginRight: 'auto' }}
            >
              Удалить
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            Отмена
          </button>
          {isAdmin && (
            <button className="btn btn-primary" onClick={save} disabled={submitting}>
              {submitting ? 'Сохраняем…' : 'Сохранить'}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-text-3 font-semibold mb-1">Логин</div>
            <div className="mono font-semibold">{user.username}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-text-3 font-semibold mb-1">ID</div>
            <div className="mono text-xs text-text-3 truncate">{user.id}</div>
          </div>
        </div>

        <div>
          <label className="label">Имя</label>
          <input
            className="input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={!isAdmin}
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
                  onClick={() => isAdmin && setRole(r)}
                  className="px-3 py-2 rounded-[10px] text-sm transition-colors"
                  disabled={!isAdmin}
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

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            disabled={!isAdmin}
          />
          <span className="text-sm">Учётная запись активна</span>
        </label>

        {isAdmin && (
          <div>
            <label className="label">Сбросить пароль (опц.)</label>
            <input
              className="input mono"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="новый пароль ≥ 6 символов"
            />
          </div>
        )}

        {user.accesses?.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-text-3 font-semibold mb-1.5">Доступы</div>
            <div className="flex flex-wrap gap-1.5">
              {user.accesses.map((a) => (
                <span key={a.id} className="pill pill-muted">
                  {a.scope === 'GLOBAL'
                    ? 'Все'
                    : a.scope === 'COUNTRY'
                    ? a.countryName
                    : a.cityName}
                </span>
              ))}
            </div>
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
