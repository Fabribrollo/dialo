import { api } from './api.js';

export const updateMe = (cambios) => api.patch('/users/me', cambios);

export function uploadAvatar(archivo) {
  const form = new FormData();
  form.append('foto', archivo);
  return api.post('/users/me/foto', form);
}

export const removeAvatar = () => api.delete('/users/me/foto');

export function uploadCover(archivo){const form=new FormData();form.append('portada',archivo);return api.post('/users/me/portada',form);}
export const removeCover=()=>api.delete('/users/me/portada');
