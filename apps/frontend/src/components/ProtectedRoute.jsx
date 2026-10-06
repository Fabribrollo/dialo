import { Navigate, Outlet } from 'react-router';
import { useAuth } from '../hooks/useAuth.js';

export default function ProtectedRoute() {
  const { estado } = useAuth();

  if (estado === 'cargando') return <p role="status">Cargando…</p>;
  if (estado === 'noLogueado') return <Navigate to="/login" replace />;
  return <Outlet />;
}
