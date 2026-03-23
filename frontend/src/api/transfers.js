import api from './axios';

export const transfersApi = {
  getAll: (params) => api.get('/transfers', { params }),

  getById: (id) => api.get(`/transfers/${id}`),

  getPending: () => api.get('/transfers/pending'),

  getProblematic: (params) => api.get('/transfers/problematic', { params }),

  create: (data) => api.post('/transfers', data),
  // data: { senderType, senderCountryId?, senderCityId?, receiverType, receiverCountryId?, receiverCityId?, items: [{itemType, quantity}], notes? }

  accept: (id, items) =>
    api.patch(`/transfers/${id}/accept`, { items }),
  // items: [{itemType, receivedQuantity}]

  reject: (id, reason) =>
    api.patch(`/transfers/${id}/reject`, { reason }),

  cancel: (id) => api.patch(`/transfers/${id}/cancel`),

  // Phase 3: Enhanced resolution with 2FA and CompanyLoss tracking
  resolveDiscrepancy: (id, payload) =>
    api.patch(`/transfers/${id}/resolve-discrepancy`, payload),
  // payload: { resolutionType: 'ACCEPT_SENDER'|'ACCEPT_RECEIVER'|'ACCEPT_COMPROMISE', password, compromiseValues?: {BLACK: n, WHITE: n, ...} }
  
  // Get statistics for dashboard
  getStats: (params) => api.get('/transfers/stats', { params }),
};
