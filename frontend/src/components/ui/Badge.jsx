const STATUS = {
  SENT: { color: 'bg-amber-500/15 text-amber-400 border border-amber-500/20', label: 'Отправлена' },
  ACCEPTED: { color: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20', label: 'Принята' },
  DISCREPANCY_FOUND: { color: 'bg-orange-500/15 text-orange-400 border border-orange-500/20', label: 'Расхождение' },
  REJECTED: { color: 'bg-red-500/15 text-red-400 border border-red-500/20', label: 'Отклонена' },
  CANCELLED: { color: 'bg-gray-500/15 text-gray-400 border border-gray-500/20', label: 'Отменена' },
};

export default function Badge({ status, children, className = '' }) {
  if (status && STATUS[status]) {
    const s = STATUS[status];
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${s.color} ${className}`}>
        {s.label}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface-card text-content-secondary border border-edge ${className}`}>
      {children}
    </span>
  );
}

export { STATUS as STATUS_MAP };
