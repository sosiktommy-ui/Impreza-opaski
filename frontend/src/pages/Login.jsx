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
      setError(err.response?.data?.message || 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-brand-50 to-brand-100 dark:from-gray-900 dark:to-gray-800 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-brand-700 tracking-tight">IMPREZA</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Система учёта браслетов</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 space-y-4">
          <Input
            label="Логин"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Введите логин"
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
            <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg">{error}</div>
          )}

          <Button type="submit" loading={loading} className="w-full">
            Войти
          </Button>
        </form>
      </div>
    </div>
  );
}
