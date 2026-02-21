import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: string;
  className?: string;
}

export default function Badge({ children, variant, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        variant,
        className,
      )}
    >
      {children}
    </span>
  );
}
