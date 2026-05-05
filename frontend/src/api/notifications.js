import api from './axios';

export const notificationsApi = {
  getAll: (params) => api.get('/notifications', { params }),

  getUnreadCount: () => api.get('/notifications/unread-count'),

  markRead: (id) => api.patch(`/notifications/${id}/read`),

  markAllRead: () => api.patch('/notifications/read-all'),
};
