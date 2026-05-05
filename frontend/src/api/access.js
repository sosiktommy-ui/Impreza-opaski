import api from './axios';

/** Admin-only UserAccess CRUD. */
export const accessApi = {
  listForUser: (userId) => api.get(`/access/users/${userId}`),
  grant: (payload) => api.post('/access', payload),
  revoke: (id) => api.patch(`/access/${id}/revoke`),
  update: (id, payload) => api.patch(`/access/${id}`, payload),
};
