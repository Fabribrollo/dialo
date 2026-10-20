import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../hooks/useAuth.js";
import SesionNoVerificada from "./SesionNoVerificada.jsx";
import { invitationReturnPath, rememberInvitation } from "../utils-invitations.js";

export default function ProtectedRoute() {
  const { estado } = useAuth();
  const { pathname } = useLocation();
  const invitation = invitationReturnPath(pathname);
  useEffect(() => {
    if (estado === 'noLogueado' && invitation) rememberInvitation(invitation);
  }, [estado, invitation]);

  if (estado === "cargando")
    return (
      <div className="empty-state app-loading" role="status">
        Cargando sesión…
      </div>
    );
  if (estado === "error") return <SesionNoVerificada />;
  if (estado === "noLogueado") return <Navigate to="/login" replace state={invitation ? { from: invitation } : undefined} />;
  return <Outlet />;
}
