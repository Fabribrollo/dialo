import { api } from './api.js';

export const getInvitations = (id) => api.get(`/communities/${id}/invitations`);
export const createInvitation = (id, datos) => api.post(`/communities/${id}/invitations`, datos);
export const revokeInvitation = (id, idInvitacion) => api.delete(`/communities/${id}/invitations/${idInvitacion}`);
export const previewInvitation = (codigo) => api.get(`/invitations/${encodeURIComponent(codigo)}`);
export const acceptInvitation = (codigo) => api.post(`/invitations/${encodeURIComponent(codigo)}/accept`);
