import { create } from 'zustand';
import { authApi } from '../api/auth';

const TOKEN_KEY = 'impreza_access_token';
const USER_KEY = 'impreza_user';
const ACCESS_KEY = 'impreza_current_access';
const PERSONAL_KEY = 'impreza_personal_token';

// ── sessionStorage is per-tab, so two tabs can hold different accounts ──
const ss = sessionStorage;

const readJson = (key) => {
  try { return JSON.parse(ss.getItem(key)); } catch { return null; }
};

/** Extract the user/access/token from a backend auth response payload. */
const unwrapAuthResult = (data) => data?.data ?? data;

export const useAuthStore = create((set, get) => ({
  token: null,
  user: null,
  loading: true,

  // ── Phase 3: two-step login state ─────────────────────────────────────────
  personalToken: null,        // short-lived token between step 1 and step 2
  pendingAccesses: [],        // populated when user must pick a scope
  currentAccess: null,        // {id, scopeType, scopeId, target, expiresAt}

  setToken: (token) => {
    if (token) ss.setItem(TOKEN_KEY, token); else ss.removeItem(TOKEN_KEY);
    set({ token });
  },

  /** Legacy single-step login. Backend auto-picks default access. */
  login: async (username, password) => {
    const { data } = await authApi.login(username, password);
    const result = unwrapAuthResult(data);
    const token = result.accessToken;
    if (token) ss.setItem(TOKEN_KEY, token);
    if (result.user) ss.setItem(USER_KEY, JSON.stringify(result.user));
    set({ token, user: result.user, loading: false, currentAccess: null });
    try {
      const { data: meData } = await authApi.me();
      const me = unwrapAuthResult(meData);
      if (me?.access) {
        ss.setItem(ACCESS_KEY, JSON.stringify(me.access));
        set({ currentAccess: me.access });
      }
    } catch { /* ignore */ }
    return result.user;
  },

  /**
   * Step 1 of two-step login. Returns:
   *  - { autoSelected: true, user } when user has exactly one access
   *  - { autoSelected: false, accesses } when user must pick a scope
   * Throws when credentials invalid or no active access.
   */
  loginPersonal: async (username, password) => {
    const { data } = await authApi.loginPersonal(username, password);
    const result = unwrapAuthResult(data);
    const personalToken = result.personalAccessToken;
    if (!personalToken) throw new Error('no personal token');
    ss.setItem(PERSONAL_KEY, personalToken);
    set({ personalToken });

    const { data: accData } = await authApi.myAccesses(personalToken);
    const accesses = (accData?.accesses ?? accData?.data?.accesses ?? []) || [];

    if (accesses.length === 0) {
      ss.removeItem(PERSONAL_KEY);
      set({ personalToken: null });
      const err = new Error('No active access');
      err.code = 'NO_ACCESS';
      throw err;
    }

    if (accesses.length === 1) {
      const user = await get().selectScope(accesses[0].id);
      return { autoSelected: true, user };
    }

    set({ pendingAccesses: accesses });
    return { autoSelected: false, accesses };
  },

  /** Step 2 of two-step login. Exchanges personal token for scoped token. */
  selectScope: async (accessId) => {
    const personalToken = get().personalToken || ss.getItem(PERSONAL_KEY);
    if (!personalToken) throw new Error('No personal token; restart login');

    const { data } = await authApi.selectScope(personalToken, accessId);
    const result = unwrapAuthResult(data);
    const token = result.accessToken;
    if (token) ss.setItem(TOKEN_KEY, token);
    if (result.user) ss.setItem(USER_KEY, JSON.stringify(result.user));

    ss.removeItem(PERSONAL_KEY);
    set({
      token,
      user: result.user,
      personalToken: null,
      pendingAccesses: [],
      loading: false,
    });

    try {
      const { data: meData } = await authApi.me();
      const me = unwrapAuthResult(meData);
      if (me?.access) {
        ss.setItem(ACCESS_KEY, JSON.stringify(me.access));
        set({ currentAccess: me.access });
      }
    } catch { /* ignore */ }

    return result.user;
  },

  /** Cancel an in-progress two-step login (back button on scope picker). */
  cancelPersonalLogin: () => {
    ss.removeItem(PERSONAL_KEY);
    set({ personalToken: null, pendingAccesses: [] });
  },

  /** Switch to a different scope. Reloads to drop per-page caches. */
  switchScope: async (accessId) => {
    const { data } = await authApi.switchScope(accessId);
    const result = unwrapAuthResult(data);
    const token = result.accessToken;
    if (token) ss.setItem(TOKEN_KEY, token);
    if (result.user) ss.setItem(USER_KEY, JSON.stringify(result.user));
    if (result.access) ss.setItem(ACCESS_KEY, JSON.stringify(result.access));
    window.location.reload();
  },

  logout: async () => {
    try { await authApi.logout(); } catch { /* ignore */ }
    ss.removeItem(TOKEN_KEY);
    ss.removeItem(USER_KEY);
    ss.removeItem(ACCESS_KEY);
    ss.removeItem(PERSONAL_KEY);
    set({
      token: null, user: null, currentAccess: null,
      personalToken: null, pendingAccesses: [], loading: false,
    });
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
      const cachedUser = readJson(USER_KEY);
      const cachedAccess = readJson(ACCESS_KEY);

      // ── Path A: this tab already has a token → verify it directly ──
      if (savedToken) {
        set({ token: savedToken, user: cachedUser, currentAccess: cachedAccess });
        try {
          const { data: meData } = await authApi.me();
          const me = unwrapAuthResult(meData);
          const userData = me?.user || me;
          const accessData = me?.access ?? null;
          ss.setItem(USER_KEY, JSON.stringify(userData));
          if (accessData) ss.setItem(ACCESS_KEY, JSON.stringify(accessData));
          else ss.removeItem(ACCESS_KEY);
          set({ user: userData, currentAccess: accessData, loading: false });
          return;
        } catch {
          ss.removeItem(TOKEN_KEY);
          ss.removeItem(USER_KEY);
          ss.removeItem(ACCESS_KEY);
        }
      }

      // ── Path B: no per-tab token → try the HttpOnly refresh cookie ──
      const { data } = await authApi.refresh();
      const result = unwrapAuthResult(data);
      const newToken = result.accessToken;
      if (!newToken) throw new Error('no token');

      ss.setItem(TOKEN_KEY, newToken);
      set({ token: newToken });

      const { data: meData } = await authApi.me();
      const me = unwrapAuthResult(meData);
      const userData = me?.user || me;
      const accessData = me?.access ?? null;

      if (cachedUser?.id && userData.id !== cachedUser.id) {
        ss.removeItem(TOKEN_KEY);
        ss.removeItem(USER_KEY);
        ss.removeItem(ACCESS_KEY);
        set({ token: null, user: null, currentAccess: null, loading: false });
        return;
      }

      ss.setItem(USER_KEY, JSON.stringify(userData));
      if (accessData) ss.setItem(ACCESS_KEY, JSON.stringify(accessData));
      else ss.removeItem(ACCESS_KEY);
      set({ user: userData, currentAccess: accessData, loading: false });
    } catch {
      ss.removeItem(TOKEN_KEY);
      ss.removeItem(USER_KEY);
      ss.removeItem(ACCESS_KEY);
      set({ token: null, user: null, currentAccess: null, loading: false });
    }
  },

  isAdmin: () => get().user?.role === 'ADMIN',
  isOffice: () => get().user?.role === 'OFFICE',
  isCountry: () => get().user?.role === 'COUNTRY',
  isCity: () => get().user?.role === 'CITY',
  isAdminOrOffice: () => ['ADMIN', 'OFFICE'].includes(get().user?.role),
  canManage: () => ['ADMIN', 'OFFICE', 'COUNTRY'].includes(get().user?.role),
}));
