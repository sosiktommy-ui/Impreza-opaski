import api, { unwrap } from './axios';

export async function listTransfers(params = {}) {
  const res = await api.get('/transfers', { params });
  return unwrap(res);
}

export async function getTransfer(id) {
  const res = await api.get(`/transfers/${id}`);
  return unwrap(res);
}

// { fromCityId, toCityId, lines: [{color, sentCount}], comment? }
export async function createTransfer(payload) {
  const res = await api.post('/transfers', payload);
  return unwrap(res);
}

// { lines: [{color, receivedCount}] }
export async function acceptTransfer(id, payload) {
  const res = await api.post(`/transfers/${id}/accept`, payload);
  return unwrap(res);
}

export async function rejectTransfer(id) {
  const res = await api.post(`/transfers/${id}/reject`);
  return unwrap(res);
}

export async function resolveTransfer(id) {
  const res = await api.post(`/transfers/${id}/resolve`);
  return unwrap(res);
}

export async function cancelTransfer(id) {
  const res = await api.post(`/transfers/${id}/cancel`);
  return unwrap(res);
}

export const TRANSFER_STATUS = {
  PENDING: { label: 'Ожидает', tone: 'warning' },
  ACCEPTED: { label: 'Принят', tone: 'success' },
  REJECTED: { label: 'Отклонён', tone: 'danger' },
  DISCREPANCY: { label: 'Расхождение', tone: 'danger' },
  RESOLVED: { label: 'Закрыт', tone: 'muted' },
  CANCELLED: { label: 'Отменён', tone: 'muted' },
};
