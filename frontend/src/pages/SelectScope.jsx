import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

const SCOPE_LABEL = {
  GLOBAL: 'Все страны и города',
  COUNTRY: 'Страна',
  CITY: 'Город',
};

export default function SelectScope() {
  const navigate = useNavigate();
  const { accesses, selectScope, loading, error } = useAuthStore();

  async function pick(id) {
    try {
      await selectScope(id);
      navigate('/', { replace: true });
    } catch {}
  }

  if (!accesses?.length) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="card p-8 text-center max-w-md">
          <h2 className="text-lg font-semibold mb-2">Нет доступов</h2>
          <p className="text-text-2 text-sm">Обратитесь к администратору.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 fade-in">
      <div className="w-full max-w-[480px]">
        <div className="text-center mb-8">
          <h1 className="text-[24px] font-semibold tracking-tight mb-1.5">Выберите контекст</h1>
          <p className="text-text-2 text-sm">У вас несколько доступов. Выберите, в каком работать.</p>
        </div>

        <div className="space-y-2">
          {accesses.map((a) => (
            <button
              key={a.id}
              onClick={() => pick(a.id)}
              disabled={loading}
              className="w-full text-left card p-4 hover:bg-surface-2 transition-colors disabled:opacity-60"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-text-3 font-semibold mb-1">
                    {SCOPE_LABEL[a.scope] || a.scope}
                  </div>
                  <div className="text-[15px] font-semibold">
                    {a.scope === 'GLOBAL'
                      ? 'Все страны и города'
                      : a.cityName || a.countryName || a.scope}
                  </div>
                  {a.scope === 'CITY' && a.countryCode && (
                    <div className="text-text-3 text-xs mt-0.5 mono">{a.countryCode}</div>
                  )}
                </div>
                <span className="pill pill-accent">→</span>
              </div>
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-4 text-xs text-center" style={{ color: 'var(--danger)' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
