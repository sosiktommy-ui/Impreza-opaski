export default function Card({ children, className = '', title, action, ...props }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-100 ${className}`} {...props}>
      {(title || action) && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          {title && <h3 className="font-semibold text-gray-800">{title}</h3>}
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}
