'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { login } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(username, password);
      router.push('/dashboard');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Invalid credentials';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-dark-900 via-[#1a1040] to-dark-900 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-accent-purple to-accent-blue rounded-2xl mb-4 shadow-lg shadow-accent-purple/30">
            <span className="text-2xl font-bold text-white">IM</span>
          </div>
          <h1 className="text-3xl font-bold text-white">IMPREZA</h1>
          <p className="text-dark-200 mt-1">Система учёта и трансферов</p>
        </div>

        {/* Login card */}
        <div className="bg-dark-800 border border-dark-600 rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-white mb-6">Войти в систему</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              id="username"
              label="Логин"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Введите логин"
              required
              autoFocus
            />

            <Input
              id="password"
              label="Пароль"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Введите пароль"
              required
            />

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <Button type="submit" isLoading={isLoading} className="w-full" size="lg">
              Войти
            </Button>
          </form>
        </div>

        <p className="text-center text-dark-300 text-sm mt-6">
          IMPREZA Events Management System v1.0
        </p>
      </div>
    </div>
  );
}
