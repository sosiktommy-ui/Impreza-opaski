export default function Card({ children, className = '', title, action, noPadding = false, ...props }) {
  return (
    <div className={`bg-surface-card rounded-[var(--radius-md)] shadow-sm border border-edge transition-colors ${className}`} {...props}>
      {(title || action) && (
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-edge">
          {title && <h3 className="font-semibold text-content-primary">{title}</h3>}
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={noPadding ? '' : 'p-5'}>{children}</div>
    </div>
  );
}
