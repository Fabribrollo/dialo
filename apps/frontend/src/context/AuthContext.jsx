import { createContext, useEffect, useState } from 'react';
import * as authService from '../services/authService.js';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [avisoSesion, setAvisoSesion] = useState('');
  const [usuario, setUsuario] = useState(undefined);
  // Falla de red o del servidor al verificar la sesion.
  const [errorVerificacion, setErrorVerificacion] = useState(null);

  const estado =
    usuario === undefined ? (errorVerificacion ? 'error' : 'cargando') : usuario ? 'logueado' : 'noLogueado';

  // Solo un 401 cierra la sesion local.
  async function refresh() {
    try {
      const data = await authService.getMe();
      setErrorVerificacion(null);
      setUsuario(data.usuario);
      return 'logueado';
    } catch (error) {
      if (error?.status === 401) {
        setErrorVerificacion(null);
        setUsuario(null);
        return 'noLogueado';
      }
      setErrorVerificacion(error);
      return 'error';
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function reintentar() {
    setErrorVerificacion(null);
    return refresh();
  }

  function sesionTerminada() {
    setAvisoSesion('La sesión terminó o se cerró desde otra pestaña. Volvé a iniciar sesión.');
    setErrorVerificacion(null);
    setUsuario(null);
  }

  async function login(datos) {
    const data = await authService.login(datos);
    setAvisoSesion('');
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
    avisoSesion,
    estado,
    errorVerificacion,
    login,
    register,
    logout,
    refresh,
    reintentar,
    sesionTerminada,
    setUsuario,
    forgotPassword: authService.forgotPassword,
    resetPassword: authService.resetPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
