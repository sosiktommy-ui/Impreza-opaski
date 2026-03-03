import { forwardRef } from 'react';

const Input = forwardRef(({ label, error, className = '', ...props }, ref) => (
  <div className="w-full">
    {label && (
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
    )}
    <input
      ref={ref}
      className={`
        w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm
        bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
        placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-brand-500 focus:ring-2
        focus:ring-brand-200 focus:outline-none transition-colors
        disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:text-gray-500
        ${error ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : ''}
        ${className}
      `}
      {...props}
    />
    {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
  </div>
));

Input.displayName = 'Input';
export default Input;
