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

  return { usuario, updateProfile, updateAvatar };
}
