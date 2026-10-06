import { api } from './api.js';

export const login = (datos) => api.post('/auth/login', datos);
export const register = (datos) => api.post('/auth/register', datos);
export const logout = () => api.post('/auth/logout');
export const getMe = () => api.get('/users/me');
export const forgotPassword = (datos) => api.post('/auth/forgot-password', datos);
export const resetPassword = (datos) => api.post('/auth/reset-password', datos);
