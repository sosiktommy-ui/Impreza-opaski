import api, { unwrap } from './axios';

// GET /inventory  → list by city (current user's scope)
export async function listByCity() {
  const res = await api.get('/inventory');
  return unwrap(res);
}

// GET /inventory/by-country
export async function listByCountry() {
  const res = await api.get('/inventory/by-country');
  return unwrap(res);
}

// POST /inventory/intake { cityId, color, count, note? }
export async function intake(payload) {
  const res = await api.post('/inventory/intake', payload);
  return unwrap(res);
}

export const COLORS = [
  { id: 'BLACK', label: 'Чёрный', sw: 'sw-black' },
  { id: 'WHITE', label: 'Белый', sw: 'sw-white' },
  { id: 'RED', label: 'Красный', sw: 'sw-red' },
  { id: 'BLUE', label: 'Синий', sw: 'sw-blue' },
];
