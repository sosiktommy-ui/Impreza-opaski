import api, { unwrap } from './axios';

export async function listCities() {
  const res = await api.get('/cities');
  return unwrap(res);
}

export async function createCity(payload) {
  const res = await api.post('/cities', payload);
  return unwrap(res);
}
