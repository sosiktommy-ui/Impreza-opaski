import api from './axios';

export const inventoryApi = {
  getBalance: (entityType, entityId) =>
    api.get(`/inventory/balance/${entityType}/${entityId}`),

  adjust: (data) => api.post('/inventory/adjust', data),
  // data: { entityType, entityId, itemType, quantity, reason }

  createExpense: (data) => api.post('/inventory/expense', data),
  // data: { cityId, eventName, eventDate, location, black, white, red, blue, notes }

  getExpenses: (params) => api.get('/inventory/expenses', { params }),
};
