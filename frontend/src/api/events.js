import api from './axios';

export const eventsApi = {
  getEvents: (params) => api.get('/events', { params }),
};
