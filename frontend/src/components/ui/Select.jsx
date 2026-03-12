export default function Select({ label, error, options = [], className = '', ...props }) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-content-secondary mb-1.5">{label}</label>
      )}
      <select
        className={`
          w-full rounded-[var(--radius-sm)] border border-edge px-3 py-2 text-sm
          focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none
          transition-all duration-150 bg-surface-card text-content-primary
          disabled:opacity-50 disabled:cursor-not-allowed
          ${error ? 'border-red-400' : ''} ${className}
        `}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
