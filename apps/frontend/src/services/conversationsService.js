import { api } from "./api.js";
export const getConversations = () => api.get("/conversations");
export const getConversation = (id) => api.get(`/conversations/${id}`);
export const openConversation = (idUsuario) =>
  api.post("/conversations", { idUsuario });
export const getMessages = (id, cursor) =>
  api.get(
    `/conversations/${id}/messages?limit=30${cursor ? `&cursor=${cursor}` : ""}`,
  );
