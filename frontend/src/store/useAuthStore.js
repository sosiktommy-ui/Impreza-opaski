import { create } from 'zustand';
import { authApi } from '../api/auth';

const TOKEN_KEY = 'impreza_access_token';
const USER_KEY  = 'impreza_user';
const ACCESS_KEY = 'impreza_current_access';
const PERSONAL_KEY = 'impreza_personal_token';

const ls = localStorage;

const readJson = (key) => {
  try { return JSON.parse(ls.getItem(key)); } catch { return null; }
};

const saveSession = (token, user, access) => {
  if (token) ls.setItem(TOKEN_KEY, token); else ls.removeItem(TOKEN_KEY);
  if (user)  ls.setItem(USER_KEY,  JSON.stringify(user));  else ls.removeItem(USER_KEY);
  if (access) ls.setItem(ACCESS_KEY, JSON.stringify(access)); else ls.removeItem(ACCESS_KEY);
};

const clearSession = () => {
  ls.removeItem(TOKEN_KEY);
  ls.removeItem(USER_KEY);
  ls.removeItem(ACCESS_KEY);
};

/** Extract the user/access/token from a backend auth response payload. */
const unwrapAuthResult = (data) => data?.data ?? data;

// ── Synchronous init from localStorage — no loading flash if already logged in ──
const _initToken  = ls.getItem(TOKEN_KEY);
const _initUser   = readJson(USER_KEY);
const _initAccess = readJson(ACCESS_KEY);

export const useAuthStore = create((set, get) => ({
  token:   _initToken  || null,
  user:    _initUser   || null,
  // If we have a cached session, start with loading=false so there's no spinner on refresh
  loading: !(_initToken && _initUser),

  // ── Two-step login state ───────────────────────────────────────────────────
  personalToken:   null,
  pendingAccesses: [],
  currentAccess:   _initAccess || null,

  setToken: (token) => {
    if (token) ls.setItem(TOKEN_KEY, token); else ls.removeItem(TOKEN_KEY);
    set({ token });
  },

  /** Legacy single-step login. */
  login: async (username, password) => {
    const { data } = await authApi.login(username, password);
    const result = unwrapAuthResult(data);
    const token = result.accessToken;
    saveSession(token, result.user, null);
    set({ token, user: result.user, loading: false, currentAccess: null });
    try {
      const { data: meData } = await authApi.me();
      const me = unwrapAuthResult(meData);
      if (me?.access) {
        ls.setItem(ACCESS_KEY, JSON.stringify(me.access));
        set({ currentAccess: me.access });
      }
    } catch { /* ignore */ }
    return result.user;
  },

  /**
   * Step 1 of two-step login.
   * Returns { autoSelected: true, user } or { autoSelected: false, accesses }
   */
  loginPersonal: async (username, password) => {
    const { data } = await authApi.loginPersonal(username, password);
    const result = unwrapAuthResult(data);
    const personalToken = result.personalAccessToken;
    if (!personalToken) throw new Error('no personal token');
    ls.setItem(PERSONAL_KEY, personalToken);
    set({ personalToken });

    const { data: accData } = await authApi.myAccesses(personalToken);
    const accesses = (accData?.accesses ?? accData?.data?.accesses ?? []) || [];

    if (accesses.length === 0) {
      ls.removeItem(PERSONAL_KEY);
      set({ personalToken: null });
      const err = new Error('No active access');
      err.code = 'NO_ACCESS';
      throw err;
    }

    const fullAccesses = accesses.filter((a) => a.accessType !== 'PARTIAL');
    if (fullAccesses.length === 0) {
      ls.removeItem(PERSONAL_KEY);
      set({ personalToken: null });
      const err = new Error('No full access');
      err.code = 'NO_FULL_ACCESS';
      throw err;
    }

    const userRole = result.user?.role;
    const canAutoSelect = userRole === 'ADMIN' || userRole === 'OFFICE';
    if (canAutoSelect && fullAccesses.length === 1) {
      const user = await get().selectScope(fullAccesses[0].id);
      return { autoSelected: true, user };
    }

    set({ pendingAccesses: accesses });
    return { autoSelected: false, accesses };
  },

  /** Step 2 — exchange personal token for scoped token. */
  selectScope: async (accessId) => {
    const personalToken = get().personalToken || ls.getItem(PERSONAL_KEY);
    if (!personalToken) throw new Error('No personal token; restart login');

    const selected = get().pendingAccesses.find((a) => a.id === accessId);
    if (selected?.accessType === 'PARTIAL') {
      const err = new Error('Only FULL access can be selected');
      err.code = 'PARTIAL_NOT_ALLOWED';
      throw err;
    }

    const { data } = await authApi.selectScope(personalToken, accessId);
    const result = unwrapAuthResult(data);
    const token = result.accessToken;
    saveSession(token, result.user, null);
    ls.removeItem(PERSONAL_KEY);
    set({ token, user: result.user, personalToken: null, pendingAccesses: [], loading: false });

    try {
      const { data: meData } = await authApi.me();
      const me = unwrapAuthResult(meData);
      if (me?.access) {
        ls.setItem(ACCESS_KEY, JSON.stringify(me.access));
        set({ currentAccess: me.access });
      }
    } catch { /* ignore */ }

    return result.user;
  },

  cancelPersonalLogin: () => {
    ls.removeItem(PERSONAL_KEY);
    set({ personalToken: null, pendingAccesses: [] });
  },

  switchScope: async (accessId) => {
    const { data } = await authApi.switchScope(accessId);
    const result = unwrapAuthResult(data);
    const token = result.accessToken;
    saveSession(token, result.user, result.access ?? null);
    window.location.reload();
  },

  logout: async () => {
    try { await authApi.logout(); } catch { /* ignore */ }
    clearSession();
    ls.removeItem(PERSONAL_KEY);
    set({ token: null, user: null, currentAccess: null, personalToken: null, pendingAccesses: [], loading: false });
  },

  /**
   * Called once on app mount.
   * If a cached session exists → show the app immediately, validate in background.
   * If no cached session → try refresh cookie, then redirect to login if that also fails.
   */
  checkAuth: async () => {
    const savedToken  = ls.getItem(TOKEN_KEY);
    const cachedUser  = readJson(USER_KEY);
    const cachedAccess = readJson(ACCESS_KEY);

    // ── Already have a session: show app immediately, validate quietly ──
    if (savedToken && cachedUser) {
      // loading is already false (set synchronously at store init)
      set({ token: savedToken, user: cachedUser, currentAccess: cachedAccess });

      try {
        const { data: meData } = await authApi.me();
        const me = unwrapAuthResult(meData);
        const userData = me?.user || me;
        const accessData = me?.access ?? null;
        saveSession(savedToken, userData, accessData);
        set({ user: userData, currentAccess: accessData });
      } catch {
        // Token probably expired — try refresh cookie silently
        try {
          const currentAccessId = cachedAccess?.id;
          const refreshRes = await authApi.refresh(currentAccessId);
          const result = unwrapAuthResult(refreshRes.data);
          const newToken = result.accessToken;
          if (!newToken) throw new Error('no token');
          ls.setItem(TOKEN_KEY, newToken);
          set({ token: newToken });

          const { data: meData } = await authApi.me();
          const me = unwrapAuthResult(meData);
          const userData = me?.user || me;
          const accessData = me?.access ?? null;
          saveSession(newToken, userData, accessData);
          set({ user: userData, currentAccess: accessData });
        } catch {
          // Both expired — clear and redirect to login
          clearSession();
          set({ token: null, user: null, currentAccess: null, loading: false });
        }
      }
      return;
    }

    // ── No cached session → try refresh cookie ──
    try {
      const { data } = await authApi.refresh(cachedAccess?.id);
      const result = unwrapAuthResult(data);
      const newToken = result.accessToken;
      if (!newToken) throw new Error('no token');
      ls.setItem(TOKEN_KEY, newToken);
      set({ token: newToken });

      const { data: meData } = await authApi.me();
      const me = unwrapAuthResult(meData);
      const userData = me?.user || me;
      const accessData = me?.access ?? null;
      saveSession(newToken, userData, accessData);
      set({ user: userData, currentAccess: accessData, loading: false });
    } catch {
      clearSession();
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
