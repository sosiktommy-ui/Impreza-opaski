import { create } from 'zustand';
import { authApi } from '../api/auth';

const TOKEN_KEY = 'impreza_access_token';
const USER_KEY = 'impreza_user';

// ── sessionStorage is per-tab, so two tabs can hold different accounts ──
const ss = sessionStorage;

export const useAuthStore = create((set, get) => ({
  token: null,
  user: null,
  loading: true,

  setToken: (token) => {
    if (token) {
      ss.setItem(TOKEN_KEY, token);
    } else {
      ss.removeItem(TOKEN_KEY);
    }
    set({ token });
  },

  login: async (username, password) => {
    const { data } = await authApi.login(username, password);
    const result = data.data || data;
    const token = result.accessToken;
    if (token) ss.setItem(TOKEN_KEY, token);
    if (result.user) ss.setItem(USER_KEY, JSON.stringify(result.user));
    set({ token, user: result.user, loading: false });
    return result.user;
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore
    }
    ss.removeItem(TOKEN_KEY);
    ss.removeItem(USER_KEY);
    set({ token: null, user: null, loading: false });
  },

  checkAuth: async () => {
    try {
      // ── One-time migration from shared localStorage → per-tab sessionStorage ──
      if (!ss.getItem(TOKEN_KEY) && localStorage.getItem(TOKEN_KEY)) {
        ss.setItem(TOKEN_KEY, localStorage.getItem(TOKEN_KEY));
        const lu = localStorage.getItem(USER_KEY);
        if (lu) ss.setItem(USER_KEY, lu);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      }

      const savedToken = ss.getItem(TOKEN_KEY);
      const cachedUser = (() => {
        try { return JSON.parse(ss.getItem(USER_KEY)); } catch { return null; }
      })();

      // ── Path A: this tab already has a token → verify it directly ──
      if (savedToken) {
        set({ token: savedToken, user: cachedUser });

        try {
          // Validate with /me — do NOT call refresh (cookie may belong to another tab)
          const { data: meData } = await authApi.me();
          const userData = meData?.data?.user || meData?.user || meData;
          ss.setItem(USER_KEY, JSON.stringify(userData));
          set({ user: userData, loading: false });
          return; // ✓ stay on this account
        } catch {
          // Token expired → clear and fall through to cookie-based refresh
          ss.removeItem(TOKEN_KEY);
          ss.removeItem(USER_KEY);
        }
      }

      // ── Path B: no per-tab token → try the HttpOnly refresh cookie ──
      const { data } = await authApi.refresh();
      const result = data.data || data;
      const newToken = result.accessToken;
      if (!newToken) throw new Error('no token');

      ss.setItem(TOKEN_KEY, newToken);
      set({ token: newToken });

      const { data: meData } = await authApi.me();
      const userData = meData?.data?.user || meData?.user || meData;

      // Guard: if the tab previously held a DIFFERENT user, the cookie gave us
      // the wrong session — log out instead of silently switching accounts.
      if (cachedUser?.id && userData.id !== cachedUser.id) {
        ss.removeItem(TOKEN_KEY);
        ss.removeItem(USER_KEY);
        set({ token: null, user: null, loading: false });
        return;
      }

      ss.setItem(USER_KEY, JSON.stringify(userData));
      set({ user: userData, loading: false });
    } catch {
      ss.removeItem(TOKEN_KEY);
      ss.removeItem(USER_KEY);
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
