import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { login, loading, error, clearError } = useAuthStore();

  const from = location.state?.from?.pathname || '/';

  async function onSubmit(e) {
    e.preventDefault();
    clearError();
    try {
      const data = await login(username.trim(), password);
      // If only one access — selectScope is auto-called → sessionToken set → go home.
      if (data.accesses.length === 1) {
        navigate(from, { replace: true });
      } else {
        navigate('/select-scope', { replace: true });
      }
    } catch {}
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 fade-in">
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div
              className="w-9 h-9 rounded-[10px] flex items-center justify-center"
              style={{ background: 'var(--accent)' }}
            >
              <span className="text-white font-bold text-lg">I</span>
            </div>
            <span className="text-[15px] font-semibold tracking-tight">Impreza</span>
          </div>
          <h1 className="text-[26px] font-semibold tracking-tight mb-1.5">С возвращением</h1>
          <p className="text-text-2 text-sm">Войдите в систему управления операциями</p>
        </div>

        <form onSubmit={onSubmit} className="card p-6 space-y-4">
          <div>
            <label className="label">Логин</label>
            <input
              autoFocus
              autoComplete="username"
              className="input"
              placeholder="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Пароль</label>
            <input
              type="password"
              autoComplete="current-password"
              className="input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <div
              className="text-xs px-3 py-2 rounded-md"
              style={{
                background: 'color-mix(in srgb, var(--danger) 12%, transparent)',
                color: 'var(--danger)',
                border: '1px solid color-mix(in srgb, var(--danger) 22%, transparent)',
              }}
            >
              {humanError(error)}
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={loading}>
            {loading ? 'Входим…' : 'Войти'}
          </button>
        </form>

        <p className="text-center text-text-3 text-xs mt-6">
          Забыли пароль? Обратитесь к администратору.
        </p>
      </div>
    </div>
  );
}

function humanError(code) {
  switch (code) {
    case 'INVALID_CREDENTIALS':
      return 'Неверный логин или пароль.';
    case 'USER_INACTIVE':
      return 'Учётная запись отключена.';
    default:
      return code || 'Ошибка входа.';
  }
}
