import { ITEM_COLORS } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface ItemBadgeProps {
  type: string;
  quantity?: number;
  size?: 'sm' | 'md';
}

export default function ItemBadge({ type, quantity, size = 'md' }: ItemBadgeProps) {
  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
  };

  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full font-medium', ITEM_COLORS[type], sizes[size])}>
      <span className={cn('w-2 h-2 rounded-full', type === 'WHITE' ? 'bg-gray-400' : 'bg-current opacity-60')} />
      {type}
      {quantity !== undefined && <span className="font-bold">{quantity}</span>}
    </span>
  );
}
