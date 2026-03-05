const BRACELET = {
  BLACK: {
    gradient: 'from-gray-800 to-gray-900',
    glow: 'shadow-gray-900/20 dark:shadow-gray-400/10',
    ring: 'ring-gray-700',
    text: 'text-white',
    label: 'Чёрные',
    dot: 'bg-gray-600',
  },
  WHITE: {
    gradient: 'from-gray-50 to-white',
    glow: 'shadow-gray-300/30 dark:shadow-gray-500/10',
    ring: 'ring-gray-200 dark:ring-gray-500',
    text: 'text-gray-800 dark:text-gray-900',
    label: 'Белые',
    dot: 'bg-gray-300',
  },
  RED: {
    gradient: 'from-red-500 to-red-600',
    glow: 'shadow-red-500/25 dark:shadow-red-400/15',
    ring: 'ring-red-400',
    text: 'text-white',
    label: 'Красные',
    dot: 'bg-red-500',
  },
  BLUE: {
    gradient: 'from-blue-500 to-blue-600',
    glow: 'shadow-blue-500/25 dark:shadow-blue-400/15',
    ring: 'ring-blue-400',
    text: 'text-white',
    label: 'Синие',
    dot: 'bg-blue-500',
  },
};

export default function BraceletCard({ type, quantity, total }) {
  const b = BRACELET[type] || BRACELET.BLACK;
  const pct = total > 0 ? Math.min((quantity / total) * 100, 100) : 0;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${b.gradient} ${b.text} p-4 shadow-lg ${b.glow} ring-1 ${b.ring} transition-all hover:scale-[1.02] hover:shadow-xl`}
    >
      {/* Background decorative circle */}
      <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-white/5" />
      <div className="absolute -right-2 -bottom-6 w-16 h-16 rounded-full bg-white/5" />

      {/* Quantity */}
      <div className="relative">
        <div className="text-3xl font-extrabold leading-none tracking-tight">
          {quantity}
        </div>
        <div className="text-xs mt-1 opacity-70 font-medium">{b.label}</div>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="mt-3 h-1 rounded-full bg-white/20 overflow-hidden">
          <div
            className="h-full rounded-full bg-white/50 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}
