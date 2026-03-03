import { create } from 'zustand';
import { authApi } from '../api/auth';

const TOKEN_KEY = 'impreza_access_token';
const USER_KEY = 'impreza_user';

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
    if (result.user) localStorage.setItem(USER_KEY, JSON.stringify(result.user));
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
    localStorage.removeItem(USER_KEY);
    set({ token: null, user: null, loading: false });
  },

  checkAuth: async () => {
    try {
      // Restore token + cached user from localStorage for instant render
      const savedToken = localStorage.getItem(TOKEN_KEY);
      const cachedUser = (() => {
        try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
      })();

      if (savedToken) {
        set({ token: savedToken, user: cachedUser });
      }

      // Try refreshing via HttpOnly cookie (rotates tokens)
      const { data } = await authApi.refresh();
      const result = data.data || data;
      const newToken = result.accessToken;
      if (newToken) localStorage.setItem(TOKEN_KEY, newToken);
      set({ token: newToken, loading: false });

      // Fetch fresh user info (includes city/country relations now)
      const { data: meData } = await authApi.me();
      const userData = meData?.data?.user || meData?.user || meData;
      localStorage.setItem(USER_KEY, JSON.stringify(userData));
      set({ user: userData });
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
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
