import { useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
    } catch (err) {
      const msg = err.response?.data?.message || '';
      if (msg.includes('Invalid credentials')) {
        setError('Неверный логин или пароль');
      } else if (msg.includes('refresh token') || msg.includes('No refresh')) {
        setError('Сессия истекла. Попробуйте ещё раз');
      } else {
        setError(msg || 'Ошибка входа');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-surface-primary px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-brand-500 tracking-tight">IMPREZA</h1>
          <p className="text-content-muted mt-1">Система учёта браслетов</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-surface-card rounded-[var(--radius-md)] border border-edge p-6 space-y-4">
          <Input
            label="Логин или Email"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Введите логин или email"
            autoComplete="username"
            required
          />
          <Input
            label="Пароль"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Введите пароль"
            autoComplete="current-password"
            required
          />

          {error && (
            <div className="bg-red-500/10 text-red-400 text-sm px-3 py-2 rounded-[var(--radius-sm)] border border-red-500/20">{error}</div>
          )}

          <Button type="submit" loading={loading} className="w-full">
            Войти
          </Button>
        </form>
      </div>
    </div>
  );
}
