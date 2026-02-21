import { create } from 'zustand';
import { notificationsApi } from '../api/notifications';

export const useNotificationStore = create((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  page: 1,
  totalPages: 1,

  fetchNotifications: async (page = 1) => {
    set({ loading: true });
    try {
      const { data } = await notificationsApi.getAll({ page, limit: 20 });
      const result = data.data || data;
      set({
        notifications: result.data || [],
        unreadCount: result.meta?.unreadCount || 0,
        page: result.meta?.page || 1,
        totalPages: result.meta?.totalPages || 1,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  fetchUnreadCount: async () => {
    try {
      const { data } = await notificationsApi.getUnreadCount();
      const result = data.data || data;
      set({ unreadCount: result.unreadCount || 0 });
    } catch {
      // ignore
    }
  },

  markAsRead: async (id) => {
    try {
      await notificationsApi.markRead(id);
      set((s) => ({
        notifications: s.notifications.map((n) =>
          n.id === id ? { ...n, read: true } : n,
        ),
        unreadCount: Math.max(0, s.unreadCount - 1),
      }));
    } catch {
      // ignore
    }
  },

  markAllAsRead: async () => {
    try {
      await notificationsApi.markAllRead();
      set((s) => ({
        notifications: s.notifications.map((n) => ({ ...n, read: true })),
        unreadCount: 0,
      }));
    } catch {
      // ignore
    }
  },
}));
