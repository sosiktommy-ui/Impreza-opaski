import api from './axios';

/** UserAccess API. */
export const accessApi = {
  getMy: () => api.get('/access/my'),
  listForUser: (userId) => api.get(`/access/users/${userId}`),
  grant: (payload) => api.post('/access', payload),
  revoke: (id) => api.patch(`/access/${id}/revoke`),
  update: (id, payload) => api.patch(`/access/${id}`, payload),
};
