import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('ru-RU').format(num);
}

export const ITEM_COLORS: Record<string, string> = {
  BLACK: 'bg-gray-800 text-gray-100 border border-gray-600',
  WHITE: 'bg-gray-200 text-gray-900 border border-gray-400',
  RED: 'bg-red-600/80 text-white',
  BLUE: 'bg-blue-600/80 text-white',
};

export const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-500/20 text-gray-400 border border-gray-500/30',
  SENT: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  AWAITING_ACCEPTANCE: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
  ACCEPTED: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  DISCREPANCY_FOUND: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  REJECTED: 'bg-red-500/20 text-red-400 border border-red-500/30',
  CANCELLED: 'bg-gray-500/20 text-gray-500 border border-gray-500/30',
};

export const CITY_STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  LOW: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  INACTIVE: 'bg-red-500/20 text-red-400 border border-red-500/30',
};

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Черновик',
  SENT: 'Отправлено',
  AWAITING_ACCEPTANCE: 'Ожидает приёмки',
  ACCEPTED: 'Принято',
  DISCREPANCY_FOUND: 'Расхождение',
  REJECTED: 'Отклонено',
  CANCELLED: 'Отменено',
};

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Админ',
  COUNTRY: 'Страна',
  CITY: 'Город',
};
