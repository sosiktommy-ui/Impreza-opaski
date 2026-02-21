const COLORS = {
  BLACK: { bg: 'bg-gray-900', text: 'text-white', label: 'Чёрный' },
  WHITE: { bg: 'bg-white border border-gray-300', text: 'text-gray-800', label: 'Белый' },
  RED: { bg: 'bg-red-600', text: 'text-white', label: 'Красный' },
  BLUE: { bg: 'bg-blue-600', text: 'text-white', label: 'Синий' },
};

export default function BraceletBadge({ type, count, size = 'md' }) {
  const color = COLORS[type] || COLORS.BLACK;
  const sizeClass = size === 'sm' ? 'w-6 h-6 text-xs' : 'w-9 h-9 text-sm';

  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`${sizeClass} rounded-full ${color.bg} ${color.text} flex items-center justify-center font-bold shadow-sm`}
        title={color.label}
      >
        {count !== undefined ? count : ''}
      </div>
      {count !== undefined && size !== 'sm' && (
        <span className="text-xs text-gray-500">{color.label}</span>
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
