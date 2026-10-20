import { api } from './api.js';

export const getChannels = (idComunidad) => api.get(`/communities/${idComunidad}/channels`);
export const createChannel = (idComunidad, datos) => api.post(`/communities/${idComunidad}/channels`, datos);
export const updateChannel = (id, datos) => api.patch(`/channels/${id}`, datos);
export const deleteChannel = (id) => api.delete(`/channels/${id}`);
export const orderChannels = (idComunidad, orden) => api.put(`/communities/${idComunidad}/channels/order`, { orden });
export const getChannelAccess = (id) => api.get(`/channels/${id}/access`);
export const replaceChannelAccess = (id, acceso) => api.put(`/channels/${id}/access`, acceso);
export const getChannel = (id) => api.get(`/channels/${id}`);
export const getChannelMessages = (id, cursor) => api.get(`/channels/${id}/messages${cursor ? `?cursor=${cursor}` : ''}`);
