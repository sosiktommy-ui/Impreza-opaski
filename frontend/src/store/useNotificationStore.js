import { create } from 'zustand';
import { notificationsApi } from '../api/notifications';
import { transfersApi } from '../api/transfers';

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
      const notifications = result.data || result || [];
      
      // If we have notifications from API, use them
      if (notifications.length > 0) {
        set({
          notifications,
          unreadCount: result.meta?.unreadCount || notifications.filter(n => !n.read).length,
          page: result.meta?.page || 1,
          totalPages: result.meta?.totalPages || 1,
          loading: false,
        });
        return;
      }
      
      // Fallback: generate notifications from transfers
      await get().generateFromTransfers();
    } catch {
      // On API error, try to generate from transfers
      await get().generateFromTransfers();
    }
  },

  generateFromTransfers: async () => {
    try {
      const notifications = [];
      
      // Fetch pending transfers (for incoming notification)
      try {
        const { data: pendingData } = await transfersApi.getPending();
        const pending = pendingData?.data || pendingData || [];
        const pendingList = Array.isArray(pending) ? pending : [];
        
        pendingList.slice(0, 5).forEach(t => {
          const senderName = t.senderCity?.name || t.senderCountry?.name || t.senderOffice?.name || 'Отправитель';
          const totalQty = (t.items || []).reduce((s, i) => s + (i.quantity || i.sentQuantity || 0), 0);
          notifications.push({
            id: `pending-${t.id}`,
            type: 'INCOMING_TRANSFER',
            title: 'Входящий перевод',
            message: `От ${senderName}: ${totalQty} браслетов ожидают получения`,
            createdAt: t.createdAt,
            read: false,
            link: '/acceptance',
          });
        });
      } catch {}
      
      // Fetch problematic transfers (for discrepancy notification)
      try {
        const { data: probData } = await transfersApi.getProblematic({ limit: 5 });
        const problematic = probData?.data || probData || [];
        const probList = Array.isArray(problematic) ? problematic : [];
        
        probList.slice(0, 5).forEach(t => {
          const senderName = t.senderCity?.name || t.senderCountry?.name || t.senderOffice?.name || 'Отправитель';
          const receiverName = t.receiverCity?.name || t.receiverCountry?.name || 'Получатель';
          notifications.push({
            id: `prob-${t.id}`,
            type: 'DISCREPANCY_ALERT',
            title: 'Расхождение в переводе',
            message: `${senderName} → ${receiverName}: требуется решение`,
            createdAt: t.updatedAt || t.createdAt,
            read: false,
            link: '/problematic',
          });
        });
      } catch {}
      
      // Sort by date
      notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      set({
        notifications,
        unreadCount: notifications.filter(n => !n.read).length,
        loading: false,
      });
    } catch {
      set({ notifications: [], unreadCount: 0, loading: false });
    }
  },

  fetchUnreadCount: async () => {
    try {
      const { data } = await notificationsApi.getUnreadCount();
      const result = data.data || data;
      const count = result.unreadCount || 0;
      
      // If API returns 0, check if we should generate from transfers
      if (count === 0) {
        const currentNotifications = get().notifications;
        if (currentNotifications.length === 0) {
          // Generate notifications if we have none
          await get().generateFromTransfers();
          return;
        }
      }
      
      set({ unreadCount: count });
    } catch {
      // On error, recalculate from current notifications
      const currentNotifications = get().notifications;
      set({ unreadCount: currentNotifications.filter(n => !n.read).length });
    }
  },

  markAsRead: async (id) => {
    // Check if this is a generated notification (starts with pending- or prob-)
    if (id.startsWith('pending-') || id.startsWith('prob-')) {
      set((s) => ({
        notifications: s.notifications.map((n) =>
          n.id === id ? { ...n, read: true } : n,
        ),
        unreadCount: Math.max(0, s.unreadCount - 1),
      }));
      return;
    }
    
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
    // Check if we have generated notifications
    const hasGenerated = get().notifications.some(n => n.id.startsWith('pending-') || n.id.startsWith('prob-'));
    
    if (hasGenerated) {
      set((s) => ({
        notifications: s.notifications.map((n) => ({ ...n, read: true })),
        unreadCount: 0,
      }));
      return;
    }
    
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
