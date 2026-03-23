import api from './axios';

export const inventoryApi = {
  getAll: () => api.get('/inventory'),

  getMy: () => api.get('/inventory/my'),

  getMapData: () => api.get('/inventory/map'),

  getByCountry: (countryId) => api.get(`/inventory/country/${countryId}`),

  getBalance: (entityType, entityId) =>
    api.get(`/inventory/${entityType}/${entityId}`),

  adjust: (data) => api.post('/inventory/adjust', data),
  // data: { entityType, entityId, itemType, delta, reason }

  createExpense: (data) => api.post('/inventory/expense', data),
  // data: { cityId, eventName, eventDate, location, black, white, red, blue, notes }

  getExpenses: (params) => api.get('/inventory/expenses', { params }),

  deleteExpense: (id) => api.delete(`/inventory/expense/${id}`),

  // ─────────────────────────────────────────────────────────────────
  // Warehouse (ADMIN/OFFICE) - создание браслетов на складе
  // ─────────────────────────────────────────────────────────────────
  createBracelets: (data) => api.post('/inventory/warehouse/create-bracelets', data),
  // data: { officeId, black, white, red, blue, notes }

  getWarehouseCreationHistory: (params) => api.get('/inventory/warehouse/creation-history', { params }),
  // params: { officeId, skip, take }

  getWarehouseBalance: (officeId) => api.get('/inventory/warehouse/balance', { params: { officeId } }),

  // ─────────────────────────────────────────────────────────────────
  // Company Losses - минус компании
  // ─────────────────────────────────────────────────────────────────
  getCompanyLossesSummary: () => api.get('/inventory/company-losses/summary'),

  getCompanyLosses: (params) => api.get('/inventory/company-losses', { params }),
  // params: { skip, take, search }
};
