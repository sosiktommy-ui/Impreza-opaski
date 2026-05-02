import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/layout/Header';
import { changePassword } from '../api/auth';
import { useAuthStore } from '../store/useAuthStore';

export default function Settings() {
  const { user, currentAccess, accesses, switchScope, logout } = useAuthStore();
  const navigate = useNavigate();
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState(null); // {type:'ok'|'err', text}

  // COUNTRY role can NOT change password (per spec)
  const canChangePassword = user?.role !== 'COUNTRY';

  async function onChange() {
    setMsg(null);
    if (!oldPw || newPw.length < 6) {
      return setMsg({ type: 'err', text: 'Введите текущий и новый (≥6) пароли' });
    }
    if (newPw !== newPw2) {
      return setMsg({ type: 'err', text: 'Пароли не совпадают' });
    }
    setSubmitting(true);
    try {
      await changePassword(oldPw, newPw);
      setOldPw('');
      setNewPw('');
      setNewPw2('');
      setMsg({ type: 'ok', text: 'Пароль успешно изменён' });
    } catch (e) {
      setMsg({
        type: 'err',
        text: e?.response?.data?.error?.message || 'CHANGE_FAILED',
      });
    } finally {
      setSubmitting(false);
    }
  }

  function onLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  async function onSwitch(id) {
    try {
      await switchScope(id);
      navigate('/', { replace: true });
    } catch (e) {
      alert(e?.response?.data?.error?.message || 'SWITCH_FAILED');
    }
  }

  return (
    <>
      <Header title="Настройки" subtitle="Профиль и параметры доступа" />
      <div className="p-6 md:p-8 fade-in space-y-6 max-w-3xl">
        <div className="card p-6">
          <h2 className="text-[15px] font-semibold mb-1">Профиль</h2>
          <p className="text-text-2 text-sm mb-4">Информация об учётной записи.</p>
          <div className="grid grid-cols-2 gap-4">
            <Row label="Логин" value={user?.username} mono />
            <Row label="Имя" value={user?.displayName} />
            <Row label="Роль" value={user?.role} mono />
            <Row label="Текущий контекст" value={currentAccess?.cityName || currentAccess?.countryName || currentAccess?.scope} />
          </div>
        </div>

        {accesses?.length > 1 && (
          <div className="card p-6">
            <h2 className="text-[15px] font-semibold mb-1">Переключение контекста</h2>
            <p className="text-text-2 text-sm mb-4">Доступные вам области работы.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {accesses.map((a) => {
                const isCurrent = a.id === currentAccess?.id;
                return (
                  <button
                    key={a.id}
                    onClick={() => !isCurrent && onSwitch(a.id)}
                    disabled={isCurrent}
                    className="text-left px-4 py-3 rounded-[10px] transition-colors"
                    style={{
                      background: isCurrent
                        ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
                        : 'var(--surface-2)',
                      border: '1px solid',
                      borderColor: isCurrent ? 'var(--accent)' : 'var(--border)',
                    }}
                  >
                    <div className="text-[10px] uppercase tracking-wider text-text-3 font-semibold">
                      {a.scope}
                    </div>
                    <div className="text-sm font-semibold mt-0.5">
                      {a.scope === 'GLOBAL'
                        ? 'Все страны и города'
                        : a.cityName || a.countryName}
                    </div>
                    {isCurrent && (
                      <div className="text-xs mt-1" style={{ color: 'var(--accent)' }}>
                        Текущий
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {canChangePassword ? (
          <div className="card p-6">
            <h2 className="text-[15px] font-semibold mb-1">Смена пароля</h2>
            <p className="text-text-2 text-sm mb-4">
              Введите текущий пароль и новый (минимум 6 символов).
            </p>
            <div className="space-y-3 max-w-md">
              <div>
                <label className="label">Текущий пароль</label>
                <input
                  type="password"
                  className="input"
                  value={oldPw}
                  onChange={(e) => setOldPw(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Новый пароль</label>
                <input
                  type="password"
                  className="input"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Повтор нового пароля</label>
                <input
                  type="password"
                  className="input"
                  value={newPw2}
                  onChange={(e) => setNewPw2(e.target.value)}
                />
              </div>

              {msg && (
                <div
                  className="text-xs px-3 py-2 rounded-md"
                  style={{
                    background:
                      msg.type === 'ok'
                        ? 'color-mix(in srgb, var(--success) 12%, transparent)'
                        : 'color-mix(in srgb, var(--danger) 12%, transparent)',
                    color: msg.type === 'ok' ? 'var(--success)' : 'var(--danger)',
                  }}
                >
                  {msg.text}
                </div>
              )}

              <button className="btn btn-primary" onClick={onChange} disabled={submitting}>
                {submitting ? 'Сохраняем…' : 'Сменить пароль'}
              </button>
            </div>
          </div>
        ) : (
          <div className="card p-6">
            <h2 className="text-[15px] font-semibold mb-1">Смена пароля</h2>
            <p className="text-text-2 text-sm">
              Для вашей роли смена пароля выполняется через администратора.
            </p>
          </div>
        )}

        <div className="card p-6">
          <h2 className="text-[15px] font-semibold mb-1">Завершение сеанса</h2>
          <p className="text-text-2 text-sm mb-4">Выйти из системы на этом устройстве.</p>
          <button className="btn btn-secondary" onClick={onLogout}>
            Выйти
          </button>
        </div>
      </div>
    </>
  );
}

function Row({ label, value, mono }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-text-3 font-semibold mb-1">
        {label}
      </div>
      <div className={`text-[14px] font-semibold ${mono ? 'mono' : ''}`}>{value || '—'}</div>
    </div>
  );
}
