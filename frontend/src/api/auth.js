import api, { unwrap } from './axios';

export async function login(username, password) {
  const res = await api.post('/auth/login', { username, password });
  return unwrap(res);
}

export async function selectScope(accessId) {
  const res = await api.post('/auth/select-scope', { accessId });
  return unwrap(res);
}

export async function switchScope(accessId) {
  const res = await api.post('/auth/switch-scope', { accessId });
  return unwrap(res);
}

export async function changePassword(oldPassword, newPassword) {
  const res = await api.post('/auth/change-password', { oldPassword, newPassword });
  return unwrap(res);
}

export async function me() {
  const res = await api.get('/auth/me');
  return unwrap(res);
}

export async function myAccesses() {
  const res = await api.get('/auth/my-accesses');
  return unwrap(res);
}
