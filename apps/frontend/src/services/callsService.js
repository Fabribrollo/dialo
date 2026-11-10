import { api } from './api.js';

export const joinCall = (idCanal) => api.post(`/channels/${idCanal}/call/join`);
export const leaveCall = (idCanal) => api.post(`/channels/${idCanal}/call/leave`);
export const getCallParticipants = (idCanal) => api.get(`/channels/${idCanal}/call/participants`);
