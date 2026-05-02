import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import * as AuthApi from '../api/auth';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      currentAccess: null,
      accesses: [],
      personalToken: null,
      sessionToken: null,
      loading: false,
      error: null,

      async login(username, password) {
        set({ loading: true, error: null });
        try {
          const data = await AuthApi.login(username, password);
          localStorage.setItem('personalToken', data.personalAccessToken);
          set({
            user: data.user,
            accesses: data.accesses,
            personalToken: data.personalAccessToken,
            sessionToken: null,
            currentAccess: null,
            loading: false,
          });
          if (data.accesses.length === 1) {
            await get().selectScope(data.accesses[0].id);
          }
          return data;
        } catch (e) {
          const msg = e?.response?.data?.error?.message || e?.message || 'LOGIN_FAILED';
          set({ loading: false, error: msg });
          throw e;
        }
      },

      async selectScope(accessId) {
        set({ loading: true, error: null });
        try {
          const data = await AuthApi.selectScope(accessId);
          localStorage.setItem('sessionToken', data.sessionToken);
          localStorage.removeItem('personalToken');
          set({
            sessionToken: data.sessionToken,
            currentAccess: data.currentAccess,
            personalToken: null,
            loading: false,
          });
          // Refresh user to get current accesses
          try {
            const meData = await AuthApi.me();
            set({ user: meData.user, accesses: meData.accesses ?? get().accesses });
          } catch {}
          return data;
        } catch (e) {
          const msg = e?.response?.data?.error?.message || 'SCOPE_FAILED';
          set({ loading: false, error: msg });
          throw e;
        }
      },

      async switchScope(accessId) {
        const data = await AuthApi.switchScope(accessId);
        localStorage.setItem('sessionToken', data.sessionToken);
        set({ sessionToken: data.sessionToken, currentAccess: data.currentAccess });
      },

      logout() {
        localStorage.removeItem('sessionToken');
        localStorage.removeItem('personalToken');
        set({
          user: null,
          accesses: [],
          currentAccess: null,
          personalToken: null,
          sessionToken: null,
          error: null,
        });
      },

      clearError() {
        set({ error: null });
      },
    }),
    {
      name: 'impreza.auth',
      partialize: (s) => ({
        user: s.user,
        accesses: s.accesses,
        currentAccess: s.currentAccess,
        sessionToken: s.sessionToken,
        personalToken: s.personalToken,
      }),
    },
  ),
);
