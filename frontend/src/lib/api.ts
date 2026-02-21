import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — attach JWT
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Response interceptor — handle 401 & auto-refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // refresh token is sent automatically via HttpOnly cookie (withCredentials: true)
        const res = await axios.post(`${API_BASE}/auth/refresh`, {}, { withCredentials: true });
        const { accessToken } = res.data.data;

        localStorage.setItem('accessToken', accessToken);

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch {
        localStorage.removeItem('accessToken');
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
      }
    }

    return Promise.reject(error);
  },
);

export default api;

// ──────────────────── Auth ────────────────────
export const authApi = {
  login: (username: string, password: string) =>
    api.post('/auth/login', { username, password }),
  refresh: () =>
    api.post('/auth/refresh'),
  logout: () => api.post('/auth/logout'),
  me: () => api.post('/auth/me'),
};

// ──────────────────── Users ────────────────────
export const usersApi = {
  getAll: (params?: Record<string, string>) =>
    api.get('/users', { params }),
  getById: (id: string) => api.get(`/users/${id}`),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch(`/users/${id}`, data),
  getCountries: () => api.get('/users/countries'),
  getCities: (params?: Record<string, string>) =>
    api.get('/users/cities', { params }),
};

// ──────────────────── Inventory ────────────────────
export const inventoryApi = {
  getBalance: (entityType: string, entityId: string) =>
    api.get(`/inventory/${entityType}/${entityId}`),
  getAllBalances: (params?: Record<string, string>) =>
    api.get('/inventory', { params }),
  getByCountry: (countryId: string) =>
    api.get(`/inventory/country/${countryId}`),
  adjust: (data: {
    entityType: string;
    entityId: string;
    itemType: string;
    quantity: number;
    reason: string;
  }) => api.post('/inventory/adjust', data),
  createExpense: (data: {
    entityType: string;
    entityId: string;
    itemType: string;
    quantity: number;
    reason: string;
  }) => api.post('/inventory/expense', data),
};

// ──────────────────── Transfers ────────────────────
export const transfersApi = {
  getAll: (params?: Record<string, string>) =>
    api.get('/transfers', { params }),
  getById: (id: string) => api.get(`/transfers/${id}`),
  create: (data: {
    senderType: string;
    senderCountryId?: string;
    senderCityId?: string;
    receiverType: string;
    receiverCountryId?: string;
    receiverCityId?: string;
    items: Array<{ itemType: string; quantity: number }>;
  }) => api.post('/transfers', data),
  send: (id: string) => api.patch(`/transfers/${id}/send`),
  accept: (id: string, items: Array<{ itemType: string; receivedQuantity: number }>) =>
    api.patch(`/transfers/${id}/accept`, { items }),
  reject: (id: string, reason: string) =>
    api.patch(`/transfers/${id}/reject`, { reason }),
  cancel: (id: string) => api.patch(`/transfers/${id}/cancel`),
  getPending: () => api.get('/transfers/pending'),
};

// ──────────────────── Notifications ────────────────────
export const notificationsApi = {
  getAll: (params?: Record<string, string>) =>
    api.get('/notifications', { params }),
  getUnreadCount: () => api.get('/notifications/unread-count'),
  markAsRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllAsRead: () => api.patch('/notifications/read-all'),
};

// ──────────────────── Audit ────────────────────
export const auditApi = {
  getAll: (params?: Record<string, string>) =>
    api.get('/audit', { params }),
  getByEntity: (entityType: string, entityId: string) =>
    api.get(`/audit/entity/${entityType}/${entityId}`),
};

// ──────────────────── Health ────────────────────
export const healthApi = {
  check: () => api.get('/health'),
};
