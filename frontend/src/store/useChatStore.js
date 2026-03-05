import { create } from 'zustand';
import { chatApi } from '../api/chat';

export const useChatStore = create((set, get) => ({
  unreadCount: 0,
  _interval: null,

  fetchUnreadCount: async () => {
    try {
      const res = await chatApi.getUnreadCount();
      const count = res.data?.data ?? res.data?.count ?? res.data ?? 0;
      set({ unreadCount: typeof count === 'number' ? count : 0 });
    } catch {
      // silently ignore
    }
  },

  startPolling: () => {
    const state = get();
    if (state._interval) return;
    state.fetchUnreadCount();
    const id = setInterval(() => get().fetchUnreadCount(), 30000);
    set({ _interval: id });
  },

  stopPolling: () => {
    const state = get();
    if (state._interval) {
      clearInterval(state._interval);
      set({ _interval: null });
    }
  },

  increment: () => set((s) => ({ unreadCount: s.unreadCount + 1 })),
  reset: () => set({ unreadCount: 0 }),
}));
