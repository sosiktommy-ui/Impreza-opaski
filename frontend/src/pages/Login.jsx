import { useState } from 'react';
import { Globe, Building2, Map as MapIcon, MapPin, ArrowLeft, Sparkles } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import NeuralBg from '../components/ui/NeuralBg';

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

/* Shared animated page wrapper */
function LoginShell({ children }) {
  return (
    <div className="relative min-h-dvh overflow-hidden flex items-center justify-center px-4 py-8"
         style={{ background: '#07070f' }}>
      {/* Neural network canvas */}
      <div className="neural-bg-wrap">
        <NeuralBg />
      </div>

      {/* Vignette overlay */}
      <div className="absolute inset-0 z-[1] pointer-events-none"
           style={{ background: 'radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(7,7,15,0.6) 100%)' }} />

      {/* Content */}
      <div className="relative z-10 w-full animate-scaleIn">
        {children}
      </div>
    </div>
  );
}

/* Glass card wrapper */
function GlassCard({ children, className = '' }) {
  return (
    <div className={`
      backdrop-blur-2xl rounded-2xl border shadow-2xl
      ${className}
    `}
    style={{
      background: 'rgba(255,255,255,0.05)',
      borderColor: 'rgba(255,255,255,0.1)',
      boxShadow: '0 25px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07)',
    }}>
      {children}
    </div>
  );
}

/* Logo mark */
function LogoMark() {
  return (
    <div className="text-center mb-8 select-none">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
           style={{
             background: 'linear-gradient(135deg, rgba(108,92,231,0.3) 0%, rgba(99,102,241,0.15) 100%)',
             border: '1px solid rgba(124,108,247,0.3)',
             boxShadow: '0 0 30px rgba(108,92,231,0.25)',
           }}>
        <Sparkles size={28} style={{ color: '#a78bfa' }} />
      </div>
      <h1 className="text-4xl font-black tracking-widest"
          style={{
            background: 'linear-gradient(135deg, #c4b5fd 0%, #a78bfa 40%, #818cf8 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            letterSpacing: '0.22em',
          }}>
        IMPREZA
      </h1>
      <p className="mt-2 text-sm" style={{ color: 'rgba(255,255,255,0.38)' }}>
        Система учёта браслетов
      </p>
    </div>
  );
}

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loginPersonal     = useAuthStore((s) => s.loginPersonal);
  const selectScope       = useAuthStore((s) => s.selectScope);
  const cancelPersonalLogin = useAuthStore((s) => s.cancelPersonalLogin);
  const pendingAccesses   = useAuthStore((s) => s.pendingAccesses);
  const personalToken     = useAuthStore((s) => s.personalToken);

  const step = personalToken && pendingAccesses.length > 0 ? 'scope' : 'credentials';

  const handleCredentials = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await loginPersonal(username, password);
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

  const handleBack = () => { setError(''); cancelPersonalLogin(); };

  /* ── Scope picker ── */
  if (step === 'scope') {
    const sortedAccesses = [...pendingAccesses].sort((a, b) => {
      const aP = a.accessType === 'PARTIAL' ? 1 : 0;
      const bP = b.accessType === 'PARTIAL' ? 1 : 0;
      return aP - bP;
    });

    return (
      <LoginShell>
        <div className="max-w-md mx-auto">
          <LogoMark />

          <GlassCard className="p-5 space-y-2">
            <p className="text-sm font-medium mb-3 px-1" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Выберите рабочую область
            </p>

            {sortedAccesses.map((access) => {
              const meta     = SCOPE_META[access.scopeType] ?? SCOPE_META.CITY;
              const Icon     = meta.Icon;
              const targetName =
                access.target?.name ??
                (access.scopeType === 'GLOBAL' ? 'Все подразделения' : '—');
              const expires  = formatExpires(access.expiresAt);
              const isPartial= access.accessType === 'PARTIAL';
              return (
                <button
                  key={access.id}
                  type="button"
                  onClick={() => handlePick(access.id)}
                  disabled={submitting || isPartial}
                  className="w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: isPartial ? 'rgba(245,158,11,0.06)' : 'rgba(124,108,247,0.06)',
                    borderColor: isPartial ? 'rgba(245,158,11,0.2)' : 'rgba(124,108,247,0.18)',
                  }}
                  onMouseEnter={e => { if (!isPartial) e.currentTarget.style.background = 'rgba(124,108,247,0.14)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = isPartial ? 'rgba(245,158,11,0.06)' : 'rgba(124,108,247,0.06)'; }}
                >
                  <div className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                       style={{
                         background: isPartial ? 'rgba(245,158,11,0.15)' : 'rgba(124,108,247,0.15)',
                         color: isPartial ? '#f59e0b' : '#a78bfa',
                       }}>
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate" style={{ color: 'rgba(255,255,255,0.9)' }}>{targetName}</div>
                    <div className="text-xs truncate mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      {meta.label}
                      {isPartial ? ' • ограниченный' : ' • полный'}
                      {expires ? ` • до ${expires}` : ''}
                    </div>
                    {isPartial && (
                      <div className="text-[11px] mt-0.5" style={{ color: '#f59e0b' }}>Для входа недоступен</div>
                    )}
                  </div>
                </button>
              );
            })}

            <p className="px-1 pt-1 text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Выберите один из полных доступов для входа.
            </p>

            {error && (
              <div className="text-sm px-3 py-2 rounded-xl border"
                   style={{ background: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.25)', color: '#fca5a5' }}>
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleBack}
              className="w-full flex items-center justify-center gap-2 text-sm pt-2 transition-colors"
              style={{ color: 'rgba(255,255,255,0.4)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.75)'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}
            >
              <ArrowLeft size={14} /> Назад
            </button>
          </GlassCard>
        </div>
      </LoginShell>
    );
  }

  /* ── Credentials form ── */
  return (
    <LoginShell>
      <div className="max-w-sm mx-auto">
        <LogoMark />

        <GlassCard className="p-7 space-y-5">
          <form onSubmit={handleCredentials} className="space-y-4">
            {/* Override input styles for dark glass context */}
            <div className="space-y-1">
              <label className="block text-xs font-medium mb-1"
                     style={{ color: 'rgba(255,255,255,0.5)' }}>
                Логин или Email
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Введите логин или email"
                autoComplete="username"
                required
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all duration-200"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.9)',
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(167,139,250,0.5)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium mb-1"
                     style={{ color: 'rgba(255,255,255,0.5)' }}>
                Пароль
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Введите пароль"
                autoComplete="current-password"
                required
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all duration-200"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.9)',
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(167,139,250,0.5)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
              />
            </div>

            {error && (
              <div className="text-sm px-3 py-2.5 rounded-xl border"
                   style={{ background: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.25)', color: '#fca5a5' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed mt-1"
              style={{
                background: loading
                  ? 'rgba(108,92,231,0.5)'
                  : 'linear-gradient(135deg, #7c6cf7 0%, #6366f1 50%, #5b21b6 100%)',
                color: '#ffffff',
                boxShadow: loading ? 'none' : '0 4px 20px rgba(99,102,241,0.4)',
              }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.boxShadow = '0 6px 28px rgba(99,102,241,0.6)'; }}
              onMouseLeave={e => { if (!loading) e.currentTarget.style.boxShadow = '0 4px 20px rgba(99,102,241,0.4)'; }}
            >
              {loading ? 'Вход...' : 'Войти'}
            </button>
          </form>
        </GlassCard>
      </div>
    </LoginShell>
  );
}

