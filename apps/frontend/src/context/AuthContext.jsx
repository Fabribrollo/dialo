import { createContext, useEffect, useState } from 'react';
import * as authService from '../services/authService.js';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(undefined);

  const estado = usuario === undefined ? 'cargando' : usuario ? 'logueado' : 'noLogueado';

  async function refresh() {
    try {
      const data = await authService.getMe();
      setUsuario(data.usuario);
    } catch {
      setUsuario(null);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function login(datos) {
    const data = await authService.login(datos);
    setUsuario(data.usuario);
  }

  async function register(datos) {
    const data = await authService.register(datos);
    setUsuario(data.usuario);
  }

  async function logout() {
    try {
      await authService.logout();
    } finally {
      setUsuario(null);
    }
  }

  const value = {
    usuario,
    estado,
    login,
    register,
    logout,
    refresh,
    setUsuario,
    forgotPassword: authService.forgotPassword,
    resetPassword: authService.resetPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
