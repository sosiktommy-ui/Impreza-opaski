import api, { unwrap } from './axios';

export async function listExpenses(params = {}) {
  const res = await api.get('/expenses', { params });
  return unwrap(res);
}

// { cityId, color, count, kind, reason? }
export async function createExpense(payload) {
  const res = await api.post('/expenses', payload);
  return unwrap(res);
}

export async function deleteExpense(id) {
  const res = await api.delete(`/expenses/${id}`);
  return unwrap(res);
}

export const EXPENSE_KINDS = [
  { id: 'PROMO', label: 'Промо', tone: 'accent' },
  { id: 'LOSS', label: 'Потеря', tone: 'warning' },
  { id: 'DAMAGE', label: 'Брак', tone: 'danger' },
  { id: 'SHORTAGE', label: 'Недостача', tone: 'danger' },
  { id: 'OTHER', label: 'Другое', tone: 'muted' },
];

export const EXPENSE_KIND_MAP = Object.fromEntries(EXPENSE_KINDS.map((k) => [k.id, k]));
