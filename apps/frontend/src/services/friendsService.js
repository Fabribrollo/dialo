import { api } from "./api.js";

export const searchUsers = (q) =>
  api.get(`/users/search?q=${encodeURIComponent(q)}`);
export const getFriends = () => api.get("/friends");
export const getRequests = (tipo) => api.get(`/friends/requests?tipo=${tipo}`);
export const sendRequest = (idReceptor) =>
  api.post("/friends/requests", { idReceptor });
export const acceptRequest = (id) => api.post(`/friends/requests/${id}/accept`);
export const rejectRequest = (id) => api.post(`/friends/requests/${id}/reject`);
export const removeFriend = (idUsuario) => api.delete(`/friends/${idUsuario}`);
