import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
});

api.interceptors.request.use((config) => {
  const session = localStorage.getItem('sessionToken');
  const personal = localStorage.getItem('personalToken');
  const token = session || personal;
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      const path = window.location.pathname;
      if (path !== '/login' && path !== '/select-scope') {
        localStorage.removeItem('sessionToken');
        localStorage.removeItem('personalToken');
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  },
);

// Unwrap our envelope: { success, data, timestamp }
export function unwrap(res) {
  return res.data?.data ?? res.data;
}

export default api;
