import api from './axios';

export const auditApi = {
  getAll: (params) => api.get('/audit', { params }),
  getByEntity: (entityType, entityId) => api.get(`/audit/entity/${entityType}/${entityId}`),
};
