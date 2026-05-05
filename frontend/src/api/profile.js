import api from './axios';

export const profileApi = {
  get: () => api.get('/profile'),

  update: (data) => api.patch('/profile', data),
  // data: { displayName?, email?, avatarUrl? }

  changePassword: (currentPassword, newPassword) =>
    api.patch('/profile/password', { currentPassword, newPassword }),
};
