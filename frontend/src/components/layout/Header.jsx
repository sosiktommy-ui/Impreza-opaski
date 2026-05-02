import ThemeToggle from '../ui/ThemeToggle';
import { useAuthStore } from '../../store/useAuthStore';

export default function Header({ title, subtitle, right }) {
  const { currentAccess } = useAuthStore();

  return (
    <header
      className="sticky top-0 z-10 px-6 md:px-8 py-4 border-b backdrop-blur"
      style={{
        borderColor: 'var(--border)',
        background: 'color-mix(in srgb, var(--bg) 85%, transparent)',
      }}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-text-3 font-semibold">
            <span>{currentAccess?.scope || '—'}</span>
            {currentAccess?.cityName && (
              <>
                <span className="text-text-3">/</span>
                <span className="mono">{currentAccess.cityName}</span>
              </>
            )}
          </div>
          <h1 className="text-[20px] md:text-[22px] font-semibold tracking-tight mt-0.5 truncate">
            {title}
          </h1>
          {subtitle && <p className="text-text-2 text-sm mt-0.5 truncate">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {right}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
