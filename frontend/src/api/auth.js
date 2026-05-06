import api from './axios';
import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || '/api';

/** Helper for endpoints that must use a personal token (not the scoped one
 *  stored in the auth store). Sends an explicit Authorization header and
 *  bypasses the request interceptor by using a fresh axios call. */
const withPersonalToken = (personalToken) => ({
  get: (url) =>
    axios.get(`${baseURL}${url}`, {
      headers: { Authorization: `Bearer ${personalToken}` },
      withCredentials: true,
    }),
  post: (url, body) =>
    axios.post(`${baseURL}${url}`, body, {
      headers: { Authorization: `Bearer ${personalToken}` },
      withCredentials: true,
    }),
});

/** Unwrap backend { success, data, timestamp } envelope. */
const unwrap = (res) => {
  const d = res.data;
  if (d && typeof d === 'object' && 'success' in d && 'data' in d) {
    return { ...res, data: d.data };
  }
  return res;
};

export const authApi = {
  // Legacy single-step login (still works; backend auto-picks default access).
  login: (username, password) =>
    api.post('/auth/login', { username, password }),

  refresh: (accessId) => api.post('/auth/refresh', {}, {
    headers: accessId ? { 'X-Access-Id': accessId } : undefined,
  }),

  logout: () => api.post('/auth/logout'),

  me: () => api.get('/auth/me'),

  verifyPassword: (password) => api.post('/auth/verify-password', { password }),

  // ── Two-step login (Phase 3) ─────────────────────────────────────────────
  loginPersonal: (username, password) =>
    api.post('/auth/login-personal', { username, password }),

  myAccesses: (personalToken) =>
    withPersonalToken(personalToken).get('/auth/my-accesses').then(unwrap),

  // Same data, but for callers already holding a scoped token (header dropdown).
  myAccessesScoped: () => api.get('/auth/accesses'),

  selectScope: (personalToken, accessId) =>
    withPersonalToken(personalToken).post('/auth/select-scope', { accessId }).then(unwrap),

  // Uses the current scoped token (request interceptor adds it).
  switchScope: (accessId) => api.post('/auth/switch-scope', { accessId }),
};
