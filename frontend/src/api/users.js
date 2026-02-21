import api from './axios';

export const usersApi = {
  getAll: () => api.get('/users'),

  getById: (id) => api.get(`/users/${id}`),

  create: (data) => api.post('/users', data),
  // data: { username, password, email, role, displayName, countryId?, cityId? }

  update: (id, data) => api.patch(`/users/${id}`, data),

  remove: (id) => api.delete(`/users/${id}`),

  resetPassword: (id, newPassword) =>
    api.patch(`/users/${id}/password`, { newPassword }),

  getCountries: () => api.get('/users/countries'),

  getCities: (countryId) =>
    api.get('/users/cities', { params: { countryId } }),
};
