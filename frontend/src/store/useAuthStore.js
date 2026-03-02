import { create } from 'zustand';
import { authApi } from '../api/auth';

const TOKEN_KEY = 'impreza_access_token';

export const useAuthStore = create((set, get) => ({
  token: null,
  user: null,
  loading: true,

  setToken: (token) => {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
    set({ token });
  },

  login: async (username, password) => {
    const { data } = await authApi.login(username, password);
    const result = data.data || data;
    const token = result.accessToken;
    if (token) localStorage.setItem(TOKEN_KEY, token);
    set({ token, user: result.user, loading: false });
    return result.user;
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore
    }
    localStorage.removeItem(TOKEN_KEY);
    set({ token: null, user: null, loading: false });
  },

  checkAuth: async () => {
    try {
      // Restore token from localStorage so interceptor can attach it immediately
      const savedToken = localStorage.getItem(TOKEN_KEY);
      if (savedToken) {
        set({ token: savedToken });
      }

      // Try refreshing via HttpOnly cookie (rotates tokens)
      const { data } = await authApi.refresh();
      const result = data.data || data;
      const newToken = result.accessToken;
      if (newToken) localStorage.setItem(TOKEN_KEY, newToken);
      set({ token: newToken, loading: false });

      // Fetch user info
      const { data: meData } = await authApi.me();
      const userData = meData?.data?.user || meData?.user || meData;
      set({ user: userData });
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      set({ token: null, user: null, loading: false });
    }
  },

  isAdmin: () => get().user?.role === 'ADMIN',
  isOffice: () => get().user?.role === 'OFFICE',
  isCountry: () => get().user?.role === 'COUNTRY',
  isCity: () => get().user?.role === 'CITY',
  isAdminOrOffice: () => ['ADMIN', 'OFFICE'].includes(get().user?.role),
  canManage: () => ['ADMIN', 'OFFICE', 'COUNTRY'].includes(get().user?.role),
}));
