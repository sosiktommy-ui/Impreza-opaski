import api, { unwrap } from './axios';

export async function listCountries() {
  const res = await api.get('/countries');
  return unwrap(res);
}

export async function createCountry(payload) {
  const res = await api.post('/countries', payload);
  return unwrap(res);
}
