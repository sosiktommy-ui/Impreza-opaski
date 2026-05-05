import api from './axios';

/** Personal balances API (Phase 4). */
export const balancesApi = {
  /** Caller's own balance. CITY/COUNTRY only — returns null for ADMIN/OFFICE. */
  getMine: () => api.get('/balances/me'),

  /** Specific user's balance — admin/office/country. */
  getForUser: (userId) => api.get(`/balances/users/${userId}`),

  /** Paginated list of users with personal balances. Admin/office only. */
  list: (params) => api.get('/balances', { params }),

  /** Manual balance correction. Admin/office only.
   *  payload: { userId, color: 'BLACK'|'WHITE'|'RED'|'BLUE', delta, reason }
   */
  adjust: (payload) => api.post('/balances/adjust', payload),

  /** Caller's own balance history. */
  getMyHistory: (params) => api.get('/balances/me/history', { params }),

  /** Specific user's balance history — admin/office/country. */
  getUserHistory: (userId, params) =>
    api.get(`/balances/users/${userId}/history`, { params }),
};
