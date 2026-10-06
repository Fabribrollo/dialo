import { api } from './api.js';

export const updateMe = (cambios) => api.patch('/users/me', cambios);

export function uploadAvatar(archivo) {
  const form = new FormData();
  form.append('foto', archivo);
  return api.post('/users/me/foto', form);
}
