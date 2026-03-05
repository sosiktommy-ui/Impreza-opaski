export default function Skeleton({ className = '', count = 1 }) {
  if (count === 1) {
    return <div className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded ${className}`} />;
  }
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded ${className}`} />
      ))}
    </>
  );
}

export function SkeletonCard({ lines = 3, className = '' }) {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm ${className}`}>
      <Skeleton className="h-4 w-1/3 mb-4" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? 'w-2/3' : 'w-full'} mb-2`} />
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="bg-gradient-to-br from-gray-300 to-gray-200 dark:from-gray-700 dark:to-gray-600 rounded-2xl p-6 h-28" />

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-700" />
              <div className="flex-1">
                <div className="h-6 w-12 bg-gray-200 dark:bg-gray-700 rounded mb-1" />
                <div className="h-3 w-16 bg-gray-100 dark:bg-gray-600 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Balance cards */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
        <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl p-4 bg-gray-100 dark:bg-gray-700 h-20" />
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <div className="h-3 w-28 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 h-24" />
          ))}
        </div>
      </div>
    </div>
  );
}
