export default function Skeleton({ className = '', count = 1 }) {
  if (count === 1) {
    return <div className={`animate-shimmer rounded-[var(--radius-sm)] ${className}`} />;
  }
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`animate-shimmer rounded-[var(--radius-sm)] ${className}`} />
      ))}
    </>
  );
}

export function SkeletonCard({ lines = 3, className = '' }) {
  return (
    <div className={`bg-surface-card rounded-[var(--radius-md)] border border-edge p-5 ${className}`}>
      <Skeleton className="h-4 w-1/3 mb-4" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? 'w-2/3' : 'w-full'} mb-2`} />
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-[var(--radius-lg)] h-28 animate-shimmer" />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-surface-card rounded-[var(--radius-md)] border border-edge p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[var(--radius-sm)] animate-shimmer" />
              <div className="flex-1">
                <div className="h-6 w-12 animate-shimmer rounded mb-1" />
                <div className="h-3 w-16 animate-shimmer rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-surface-card rounded-[var(--radius-md)] border border-edge p-5">
        <div className="h-4 w-32 animate-shimmer rounded mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-[var(--radius-md)] animate-shimmer h-20" />
          ))}
        </div>
      </div>

      <div>
        <div className="h-3 w-28 animate-shimmer rounded mb-3" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-surface-card rounded-[var(--radius-md)] border border-edge p-4 h-24 animate-shimmer" />
          ))}
        </div>
      </div>
    </div>
  );
}
