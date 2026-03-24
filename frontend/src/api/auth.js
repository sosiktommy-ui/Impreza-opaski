import api from './axios';

export const authApi = {
  login: (username, password) =>
    api.post('/auth/login', { username, password }),

  refresh: () => api.post('/auth/refresh'),

  logout: () => api.post('/auth/logout'),

  me: () => api.get('/auth/me'),

  verifyPassword: (password) => api.post('/auth/verify-password', { password }),
};
