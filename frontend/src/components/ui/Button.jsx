const variants = {
  primary: 'bg-brand-600 text-white hover:bg-brand-500 shadow-sm hover:shadow-glow',
  secondary: 'bg-surface-card text-content-primary border border-edge hover:bg-surface-card-hover',
  danger: 'bg-red-600 text-white hover:bg-red-500 shadow-sm',
  ghost: 'text-content-secondary hover:bg-surface-card hover:text-content-primary',
  success: 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm',
  outline: 'border border-edge text-content-primary hover:bg-surface-card-hover bg-transparent',
};

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className = '',
  ...props
}) {
  return (
    <button
      className={`
        inline-flex items-center justify-center gap-2 font-medium
        rounded-[var(--radius-sm)] transition-all duration-150
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant]} ${sizes[size]} ${className}
      `}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
