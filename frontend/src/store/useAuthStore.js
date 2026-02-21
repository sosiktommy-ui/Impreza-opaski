import { create } from 'zustand';
import { authApi } from '../api/auth';

export const useAuthStore = create((set, get) => ({
  token: null,
  user: null,
  loading: true,

  setToken: (token) => set({ token }),

  login: async (username, password) => {
    const { data } = await authApi.login(username, password);
    const result = data.data || data;
    set({ token: result.accessToken, user: result.user, loading: false });
    return result.user;
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore
    }
    set({ token: null, user: null, loading: false });
  },

  checkAuth: async () => {
    try {
      const { data } = await authApi.refresh();
      const result = data.data || data;
      set({ token: result.accessToken, loading: false });

      // Fetch user info
      const { data: meData } = await authApi.me();
      const userData = meData?.data?.user || meData?.user || meData;
      set({ user: userData });
    } catch {
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
