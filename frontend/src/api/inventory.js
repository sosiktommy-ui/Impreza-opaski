import api from './axios';

export const inventoryApi = {
  getAll: () => api.get('/inventory'),

  getMy: () => api.get('/inventory/my'),

  getByCountry: (countryId) => api.get(`/inventory/country/${countryId}`),

  getBalance: (entityType, entityId) =>
    api.get(`/inventory/${entityType}/${entityId}`),

  adjust: (data) => api.post('/inventory/adjust', data),
  // data: { entityType, entityId, itemType, delta, reason }

  createExpense: (data) => api.post('/inventory/expense', data),
  // data: { cityId, eventName, eventDate, location, black, white, red, blue, notes }

  getExpenses: (params) => api.get('/inventory/expenses', { params }),

  deleteExpense: (id) => api.delete(`/inventory/expense/${id}`),
};
