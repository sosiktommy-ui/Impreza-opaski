import api, { unwrap } from './axios';

export async function listUsers() {
  const res = await api.get('/users');
  return unwrap(res);
}

export async function getUser(id) {
  const res = await api.get(`/users/${id}`);
  return unwrap(res);
}

// { username, displayName, password, role, accesses: [{ scope, countryId?, cityId? }] }
export async function createUser(payload) {
  const res = await api.post('/users', payload);
  return unwrap(res);
}

// { displayName?, isActive?, role? }
export async function updateUser(id, payload) {
  const res = await api.patch(`/users/${id}`, payload);
  return unwrap(res);
}

export async function deleteUser(id) {
  const res = await api.delete(`/users/${id}`);
  return unwrap(res);
}

export async function resetUserPassword(id, newPassword) {
  const res = await api.post(`/users/${id}/reset-password`, { newPassword });
  return unwrap(res);
}

export async function replaceAccesses(id, accesses) {
  const res = await api.put(`/users/${id}/accesses`, { accesses });
  return unwrap(res);
}

export const ROLE_META = {
  ADMIN: { label: 'Админ', tone: 'danger' },
  OFFICE: { label: 'Офис', tone: 'accent' },
  COUNTRY: { label: 'Страна', tone: 'success' },
  MANAGER: { label: 'Менеджер', tone: 'muted' },
};
