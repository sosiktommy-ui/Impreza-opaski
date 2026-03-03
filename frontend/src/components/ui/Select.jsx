export default function Select({ label, error, options = [], className = '', ...props }) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      )}
      <select
        className={`
          w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm
          focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none
          transition-colors bg-white dark:bg-gray-700 dark:text-gray-100 disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:text-gray-500
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
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
