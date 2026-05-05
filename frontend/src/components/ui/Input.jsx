import { forwardRef } from 'react';

const Input = forwardRef(({ label, error, className = '', ...props }, ref) => (
  <div className="w-full">
    {label && (
      <label className="block text-sm font-medium text-content-secondary mb-1.5">{label}</label>
    )}
    <input
      ref={ref}
      className={`
        w-full rounded-[var(--radius-sm)] border border-edge px-3 py-2 text-sm
        bg-surface-card text-content-primary
        placeholder:text-content-muted
        focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none
        transition-all duration-150
        disabled:opacity-50 disabled:cursor-not-allowed
        ${error ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20' : ''}
        ${className}
      `}
      {...props}
    />
    {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
  </div>
));

Input.displayName = 'Input';
export default Input;
