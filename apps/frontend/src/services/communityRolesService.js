import { api } from './api.js';

const rolesPath = (id) => `/communities/${id}/roles`;
export const getCommunityRoles = (id) => api.get(rolesPath(id));
export const createCommunityRole = (id, body) => api.post(rolesPath(id), body);
export const updateCommunityRole = (id, idRol, body) => api.patch(`${rolesPath(id)}/${idRol}`, body);
export const deleteCommunityRole = (id, idRol) => api.delete(`${rolesPath(id)}/${idRol}`);
export const updateCommunityMemberRoles = (id, idUsuario, body) =>
  api.patch(`/communities/${id}/members/${idUsuario}`, body);
