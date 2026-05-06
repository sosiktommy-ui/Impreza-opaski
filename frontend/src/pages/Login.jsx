import { useState } from 'react';
import { Globe, Building2, Map as MapIcon, MapPin, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

const SCOPE_META = {
  GLOBAL:  { Icon: Globe,     label: 'Глобальный доступ',  hint: 'Полный доступ ко всем подразделениям' },
  OFFICE:  { Icon: Building2, label: 'Офис',                hint: 'Доступ ко всем странам и городам офиса' },
  COUNTRY: { Icon: MapIcon,   label: 'Страна',              hint: 'Доступ ко всем городам страны' },
  CITY:    { Icon: MapPin,    label: 'Город',               hint: 'Доступ только к городу' },
};

function formatExpires(value) {
  if (!value) return null;
  try {
    return new Date(value).toLocaleDateString('ru-RU');
  } catch { return null; }
}

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loginPersonal = useAuthStore((s) => s.loginPersonal);
  const selectScope = useAuthStore((s) => s.selectScope);
  const cancelPersonalLogin = useAuthStore((s) => s.cancelPersonalLogin);
  const pendingAccesses = useAuthStore((s) => s.pendingAccesses);
  const personalToken = useAuthStore((s) => s.personalToken);

  const step = personalToken && pendingAccesses.length > 0 ? 'scope' : 'credentials';

  const handleCredentials = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await loginPersonal(username, password);
      // If autoSelected, store now holds a token and App will navigate away.
      // If not, step transitions to 'scope' via the derived value above.
    } catch (err) {
      if (err?.code === 'NO_ACCESS') {
        setError('У вас нет активных доступов. Обратитесь к администратору.');
      } else if (err?.code === 'NO_FULL_ACCESS') {
        setError('У вас нет полного доступа для входа. Обратитесь к администратору.');
      } else {
        const msg = err.response?.data?.message || '';
        if (msg.includes('Invalid credentials')) {
          setError('Неверный логин или пароль');
        } else if (msg.includes('disabled') || msg.includes('Login disabled')) {
          setError('Вход отключён администратором');
        } else {
          setError(msg || 'Ошибка входа');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePick = async (accessId) => {
    setError('');
    setSubmitting(true);
    try {
      await selectScope(accessId);
    } catch (err) {
      if (err?.code === 'PARTIAL_NOT_ALLOWED') {
        setError('Можно выбрать только полный доступ. Ограниченные доступны только для просмотра.');
        return;
      }
      const msg = err.response?.data?.message || 'Не удалось выбрать доступ';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    setError('');
    cancelPersonalLogin();
  };

  if (step === 'scope') {
    const sortedAccesses = [...pendingAccesses].sort((a, b) => {
      const aPartial = a.accessType === 'PARTIAL' ? 1 : 0;
      const bPartial = b.accessType === 'PARTIAL' ? 1 : 0;
      return aPartial - bPartial;
    });

    return (
      <div className="min-h-dvh flex items-center justify-center bg-surface-primary px-4 py-8">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-brand-500 tracking-tight">IMPREZA</h1>
            <p className="text-content-muted mt-1">Выберите рабочую область</p>
          </div>

          <div className="bg-surface-card rounded-[var(--radius-md)] border border-edge p-4 space-y-2">
            {sortedAccesses.map((access) => {
              const meta = SCOPE_META[access.scopeType] ?? SCOPE_META.CITY;
              const Icon = meta.Icon;
              const targetName =
                access.target?.name ??
                (access.scopeType === 'GLOBAL' ? 'Все подразделения' : '—');
              const expires = formatExpires(access.expiresAt);
              const isPartial = access.accessType === 'PARTIAL';
              return (
                <button
                  key={access.id}
                  type="button"
                  onClick={() => handlePick(access.id)}
                  disabled={submitting || isPartial}
                  className="w-full text-left flex items-center gap-3 p-3 rounded-[var(--radius-sm)] border border-edge transition disabled:opacity-60 disabled:cursor-not-allowed hover:border-brand-500 hover:bg-surface-hover disabled:hover:border-edge disabled:hover:bg-transparent"
                >
                  <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${isPartial ? 'bg-amber-500/10 text-amber-500' : 'bg-brand-500/10 text-brand-500'}`}>
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-content-primary truncate">{targetName}</div>
                    <div className="text-xs text-content-muted truncate">
                      {meta.label}
                      {isPartial ? ' • ограниченный' : ' • полный'}
                      {expires ? ` • до ${expires}` : ''}
                    </div>
                    {isPartial && (
                      <div className="text-[11px] text-amber-500 mt-1">Для входа недоступен</div>
                    )}
                  </div>
                </button>
              );
            })}

            <div className="px-1 pt-2 text-xs text-content-muted">
              Сначала войдите в аккаунт человека, затем выберите один из полных доступов.
            </div>

            {error && (
              <div className="bg-red-500/10 text-red-400 text-sm px-3 py-2 rounded-[var(--radius-sm)] border border-red-500/20">{error}</div>
            )}

            <button
              type="button"
              onClick={handleBack}
              className="w-full flex items-center justify-center gap-2 text-sm text-content-muted hover:text-content-primary mt-2 py-2"
            >
              <ArrowLeft size={14} /> Назад
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-surface-primary px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-brand-500 tracking-tight">IMPREZA</h1>
          <p className="text-content-muted mt-1">Система учёта браслетов</p>
        </div>

        <form onSubmit={handleCredentials} className="bg-surface-card rounded-[var(--radius-md)] border border-edge p-6 space-y-4">
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
