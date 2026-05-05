import api from './axios';

export const eventsApi = {
  getEvents: (params) => api.get('/events', { params }),
  
  getAll: (params) => api.get('/events', { params }),
};
