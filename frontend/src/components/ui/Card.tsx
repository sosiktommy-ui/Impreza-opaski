import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  noPadding?: boolean;
}

export default function Card({
  children,
  className,
  title,
  subtitle,
  action,
  noPadding,
}: CardProps) {
  return (
    <div className={cn('bg-dark-800 rounded-2xl border border-dark-600 shadow-lg shadow-black/20', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-600">
          <div>
            {title && <h3 className="text-base font-semibold text-white">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-sm text-dark-200">{subtitle}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={cn(!noPadding && 'p-6')}>{children}</div>
    </div>
  );
}
