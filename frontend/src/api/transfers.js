import api from './axios';

export const transfersApi = {
  getAll: (params) => api.get('/transfers', { params }),

  getById: (id) => api.get(`/transfers/${id}`),

  getPendingIncoming: () => api.get('/transfers/pending-incoming'),

  create: (data) => api.post('/transfers', data),
  // data: { fromType, fromId, toType, toId, items: [{itemType, quantity}], notes }

  accept: (id, items) =>
    api.patch(`/transfers/${id}/accept`, { items }),
  // items: [{itemType, receivedQuantity}]

  reject: (id, reason) =>
    api.patch(`/transfers/${id}/reject`, { reason }),

  cancel: (id) => api.patch(`/transfers/${id}/cancel`),
};
