import { create } from 'zustand';
import { authApi } from '@/lib/api';
import type { User } from '@/lib/types';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  login: async (username, password) => {
    const res = await authApi.login(username, password);
    const { accessToken, user } = res.data.data;
    localStorage.setItem('accessToken', accessToken);
    set({ user, isAuthenticated: true, isLoading: false });
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore
    }
    localStorage.removeItem('accessToken');
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  fetchUser: async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }
      const res = await authApi.me();
      set({ user: res.data.data.user, isAuthenticated: true, isLoading: false });
    } catch {
      localStorage.removeItem('accessToken');
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  setUser: (user) => set({ user, isAuthenticated: !!user }),
}));
