import { api } from './api.js';

const moderationPath = (id) => `/communities/${id}/moderation`;
export const getCommunityModeration = (id) => api.get(moderationPath(id));
export const replaceCommunityModeration = (id, body) => api.put(moderationPath(id), body);
// F-14: medidas manuales de silenciamiento y propuestas preparadas por IA.
const base = (id) => `/communities/${id}`;
export const getCommunitySilences = (id) => api.get(`${base(id)}/silences`);
export const silenceCommunityMember = (id, userId, { alcance, duracion, motivo }) =>
  api.put(`${base(id)}/members/${userId}/silence`, { alcance, duracion, ...(motivo ? { motivo } : {}) });
export const liftCommunitySilence = (id, userId) => api.delete(`${base(id)}/members/${userId}/silence`);
export const kickCommunityMember = (id, userId, motivo) => api.post(`${base(id)}/members/${userId}/kick`, motivo ? { motivo } : {});
export const prepareModerationProposal = (id, pedido, idDestinatario) =>
  api.post(`${base(id)}/moderation/proposals`, { pedido, ...(idDestinatario ? { idDestinatario } : {}) });
export const confirmModerationProposal = (id, idPropuesta) => api.post(`${base(id)}/moderation/proposals/${idPropuesta}/confirm`, {});
export const cancelModerationProposal = (id, idPropuesta) => api.post(`${base(id)}/moderation/proposals/${idPropuesta}/cancel`, {});
