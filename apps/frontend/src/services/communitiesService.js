import { api } from './api.js';

export const getCommunities = () => api.get('/communities');
export const getCommunity = (id) => api.get(`/communities/${id}`);
export const createCommunity = (datos) => api.post('/communities', datos);
export const updateCommunity = (id, datos) => api.patch(`/communities/${id}`, datos);
export const deleteCommunity = (id) => api.delete(`/communities/${id}`);
export function uploadCommunityImage(id, imagen) {
  const body = new FormData();
  body.append('imagen', imagen);
  return api.post(`/communities/${id}/imagen`, body);
}
