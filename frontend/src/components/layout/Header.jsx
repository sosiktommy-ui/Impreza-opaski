export default function Header({ title, subtitle, right }) {
  return (
    <header
      className="sticky top-0 z-10 h-14 px-7 flex items-center gap-4 border-b"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--surface)',
      }}
    >
      <h1 className="text-[15px] font-semibold tracking-tight">{title}</h1>
      {subtitle && (
        <span className="text-[12.5px]" style={{ color: 'var(--text-3)' }}>{subtitle}</span>
      )}
      <div className="ml-auto flex items-center gap-2">
        {right}
      </div>
    </header>
  );
}
