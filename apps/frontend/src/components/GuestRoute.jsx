import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../hooks/useAuth.js';
import SesionNoVerificada from './SesionNoVerificada.jsx';
import BootScreen from './shell/BootScreen.jsx';
import { invitationReturnPath, pendingInvitation } from '../utils/invitations.js';

export default function GuestRoute() {
  const { estado } = useAuth();
  const { state } = useLocation();
  const destination = invitationReturnPath(state?.from) || pendingInvitation() || '/';

  if (estado === 'cargando') return <BootScreen />;
  if (estado === 'error') return <SesionNoVerificada />;
  if (estado === 'logueado') return <Navigate to={destination} replace />;
  return <Outlet />;
}
