import { Navigate, Outlet } from 'react-router';
import { useAuth } from '../hooks/useAuth.js';

export default function GuestRoute() {
  const { estado } = useAuth();

  if (estado === 'cargando') return <p role="status">Cargando…</p>;
  if (estado === 'logueado') return <Navigate to="/" replace />;
  return <Outlet />;
}
