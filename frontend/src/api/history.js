import api, { unwrap } from './axios';

export async function listHistory(params = {}) {
  const res = await api.get('/history', { params });
  return unwrap(res);
}

// label + tone for actions
export const ACTION_META = {
  USER_CREATED: { label: 'Создан пользователь', tone: 'success' },
  USER_UPDATED: { label: 'Изменён пользователь', tone: 'muted' },
  USER_DELETED: { label: 'Удалён пользователь', tone: 'danger' },
  ACCESS_GRANTED: { label: 'Доступ выдан', tone: 'success' },
  ACCESS_REVOKED: { label: 'Доступ отозван', tone: 'warning' },
  INVENTORY_INTAKE: { label: 'Поступление', tone: 'accent' },
  TRANSFER_CREATED: { label: 'Передача создана', tone: 'accent' },
  TRANSFER_ACCEPTED: { label: 'Передача принята', tone: 'success' },
  TRANSFER_REJECTED: { label: 'Передача отклонена', tone: 'danger' },
  TRANSFER_DISCREPANCY: { label: 'Расхождение', tone: 'warning' },
  TRANSFER_RESOLVED: { label: 'Расхождение закрыто', tone: 'muted' },
  TRANSFER_CANCELLED: { label: 'Передача отменена', tone: 'muted' },
  EXPENSE_CREATED: { label: 'Расход', tone: 'warning' },
  EXPENSE_DELETED: { label: 'Расход удалён', tone: 'muted' },
  AUTH_LOGIN: { label: 'Вход', tone: 'muted' },
  AUTH_LOGOUT: { label: 'Выход', tone: 'muted' },
};
