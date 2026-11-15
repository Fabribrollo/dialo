import { api } from './api.js';

const moderationPath = (id) => `/communities/${id}/moderation`;
export const getCommunityModeration = (id) => api.get(moderationPath(id));
export const replaceCommunityModeration = (id, body) => api.put(moderationPath(id), body);
