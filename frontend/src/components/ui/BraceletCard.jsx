const BRACELET = {
  BLACK: {
    gradient: 'from-gray-700 to-gray-800',
    ring: 'ring-gray-600',
    text: 'text-white',
    label: 'Чёрные',
    dot: 'bg-gray-500',
  },
  WHITE: {
    gradient: 'from-gray-200 to-gray-100',
    ring: 'ring-gray-300',
    text: 'text-gray-800',
    label: 'Белые',
    dot: 'bg-gray-300',
  },
  RED: {
    gradient: 'from-red-500 to-red-600',
    ring: 'ring-red-400',
    text: 'text-white',
    label: 'Красные',
    dot: 'bg-red-500',
  },
  BLUE: {
    gradient: 'from-blue-500 to-blue-600',
    ring: 'ring-blue-400',
    text: 'text-white',
    label: 'Синие',
    dot: 'bg-blue-500',
  },
};

export default function BraceletCard({ type, quantity, total }) {
  const b = BRACELET[type] || BRACELET.BLACK;
  const pct = total > 0 ? Math.min((quantity / total) * 100, 100) : 0;
  const extraRing = type === 'WHITE' ? 'ring-2' : 'ring-1';
  const whiteBorder = type === 'WHITE' ? 'border border-gray-200 dark:border-transparent' : '';

  return (
    <div
      className={`relative overflow-hidden rounded-[var(--radius-md)] bg-gradient-to-br ${b.gradient} ${b.text} p-4 shadow-md ${extraRing} ${b.ring} ${whiteBorder} transition-all duration-200 hover:scale-[1.03] hover:shadow-lg`}
    >
      <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-white/5" />
      <div className="absolute -right-2 -bottom-6 w-16 h-16 rounded-full bg-white/5" />

      <div className="relative">
        <div className="text-3xl font-extrabold leading-none tracking-tight">
          {quantity}
        </div>
        <div className="text-xs mt-1 opacity-70 font-medium">{b.label}</div>
      </div>

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
