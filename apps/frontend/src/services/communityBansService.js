import { api } from './api.js';

const path = (id) => `/communities/${id}/bans`;
export const getCommunityBans = (id) => api.get(path(id));
export const banCommunityMember = (id, userId, motivo,duracion='PERMANENTE') =>
  api.put(`${path(id)}/${userId}`, {duracion,...(motivo?{motivo}:{})});
export const removeCommunityBan = (id, userId) => api.delete(`${path(id)}/${userId}`);
