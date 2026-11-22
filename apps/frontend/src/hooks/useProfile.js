import * as usersService from '../services/usersService.js';
import { useAuth } from './useAuth.js';

export function useProfile() {
  const { usuario, setUsuario } = useAuth();

  async function updateProfile(cambios) {
    const data = await usersService.updateMe(cambios);
    setUsuario(data.usuario);
  }

  async function updateAvatar(archivo) {
    const data = await usersService.uploadAvatar(archivo);
    setUsuario(data.usuario);
  }

  async function removeAvatar() { const data = await usersService.removeAvatar(); setUsuario(data.usuario); }
  async function updateCover(file){const data=await usersService.uploadCover(file);setUsuario(data.usuario);}
  async function removeCover(){const data=await usersService.removeCover();setUsuario(data.usuario);}
  return { updateCover,removeCover,usuario, updateProfile, updateAvatar, removeAvatar };
}
