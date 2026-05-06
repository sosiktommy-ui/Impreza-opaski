import api from './axios';

export const usersApi = {
  getAll: (params) => api.get('/users', { params }),

  getById: (id) => api.get(`/users/${id}`),

  create: (data) => api.post('/users', data),
  // data: { username, password, email, role, displayName, officeId?, countryId?, cityId? }

  update: (id, data) => api.patch(`/users/${id}`, data),

  remove: (id) => api.delete(`/users/${id}`),

  resetPassword: (id, newPassword) =>
    api.patch(`/users/${id}/password`, { newPassword }),

  getPassword: (id) => api.get(`/users/${id}/password`),

  getCountries: () => api.get('/users/countries'),

  getOffices: () => api.get('/users/offices'),

  getCities: (countryId) =>
    api.get('/users/cities', { params: { countryId } }),

  createCountry: (data) => api.post('/users/countries', data),

  createCity: (data) => api.post('/users/cities', data),
};
