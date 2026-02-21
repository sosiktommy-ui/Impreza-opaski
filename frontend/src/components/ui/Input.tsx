import { cn } from '@/lib/utils';
import { forwardRef, InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-dark-100">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            'block w-full rounded-xl border px-4 py-2.5 text-sm shadow-sm transition-colors',
            'bg-dark-700 text-white placeholder:text-dark-300',
            'focus:outline-none focus:ring-1 focus:ring-accent-purple/50 focus:border-accent-purple',
            error
              ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
              : 'border-dark-500',
            className,
          )}
          {...props}
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  },
);

Input.displayName = 'Input';
export default Input;
