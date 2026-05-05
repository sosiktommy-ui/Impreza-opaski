import api from './axios';

export const chatApi = {
  getConversations: () => api.get('/chat/conversations'),

  getUsers: () => api.get('/chat/users'),

  getUnreadCount: () => api.get('/chat/unread-count'),

  getMessages: (userId, params) =>
    api.get(`/chat/messages/${userId}`, { params }),

  sendMessage: (receiverId, text) =>
    api.post('/chat/messages', { receiverId, text }),

  markAsRead: (senderId) =>
    api.patch(`/chat/messages/${senderId}/read`),
};
