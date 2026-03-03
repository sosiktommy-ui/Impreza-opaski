export default function Card({ children, className = '', title, action, ...props }) {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 ${className}`} {...props}>
      {(title || action) && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          {title && <h3 className="font-semibold text-gray-800 dark:text-gray-100">{title}</h3>}
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}
