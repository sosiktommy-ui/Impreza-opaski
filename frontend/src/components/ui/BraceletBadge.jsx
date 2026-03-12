const COLORS = {
  BLACK: { bg: 'bg-gray-700', label: 'Чёрный' },
  WHITE: { bg: 'bg-gray-200 border border-gray-300', label: 'Белый' },
  RED: { bg: 'bg-red-500', label: 'Красный' },
  BLUE: { bg: 'bg-blue-500', label: 'Синий' },
};

export default function BraceletBadge({ type, count, size = 'md' }) {
  const color = COLORS[type] || COLORS.BLACK;
  const dotSize = size === 'sm' ? 'w-4 h-4' : 'w-6 h-6';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`${dotSize} rounded-full ${color.bg} shadow-sm flex-shrink-0`}
        title={color.label}
      />
      {count !== undefined && count !== '?' && (
        <span className={`${textSize} font-semibold text-gray-700 dark:text-gray-300`}>
          {count}
        </span>
      )}
      {count === '?' && (
        <span className={`${textSize} font-semibold text-gray-400`}>?</span>
      )}
    </div>
  );
}

export function BraceletRow({ items, size = 'md' }) {
  const order = ['BLACK', 'WHITE', 'RED', 'BLUE'];
  const mapped = {};
  if (Array.isArray(items)) {
    items.forEach((i) => {
      mapped[i.itemType] = i.quantity ?? i.receivedQuantity ?? 0;
    });
  } else if (items && typeof items === 'object') {
    Object.assign(mapped, items);
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {order.map((type) => (
        <BraceletBadge key={type} type={type} count={mapped[type] || 0} size={size} />
      ))}
    </div>
  );
}

export { COLORS as BRACELET_COLORS };
