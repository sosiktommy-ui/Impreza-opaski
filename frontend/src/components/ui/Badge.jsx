const STATUS = {
  SENT: { color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', label: 'Отправлена' },
  ACCEPTED: { color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', label: 'Принята' },
  DISCREPANCY_FOUND: { color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400', label: 'Расхождение' },
  REJECTED: { color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', label: 'Отклонена' },
  CANCELLED: { color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400', label: 'Отменена' },
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
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 ${className}`}>
      {children}
    </span>
  );
}

export { STATUS as STATUS_MAP };
