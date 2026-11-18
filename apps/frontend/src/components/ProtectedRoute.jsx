import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../hooks/useAuth.js";
import SesionNoVerificada from "./SesionNoVerificada.jsx";
import BootScreen from "./shell/BootScreen.jsx";
import { invitationReturnPath, rememberInvitation } from "../utils/invitations.js";

export default function ProtectedRoute() {
  const { estado } = useAuth();
  const { pathname } = useLocation();
  const invitation = invitationReturnPath(pathname);
  useEffect(() => {
    if (estado === 'noLogueado' && invitation) rememberInvitation(invitation);
  }, [estado, invitation]);

  if (estado === "cargando")
    return <BootScreen>Cargando sesión…</BootScreen>;
  if (estado === "error") return <SesionNoVerificada />;
  if (estado === "noLogueado") return <Navigate to="/login" replace state={invitation ? { from: invitation } : undefined} />;
  return <Outlet />;
}
