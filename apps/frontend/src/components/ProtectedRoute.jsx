import { Navigate, Outlet } from "react-router";
import { useAuth } from "../hooks/useAuth.js";

export default function ProtectedRoute() {
  const { estado } = useAuth();

  if (estado === "cargando")
    return (
      <div className="empty-state app-loading" role="status">
        Cargando sesión…
      </div>
    );
  if (estado === "noLogueado") return <Navigate to="/login" replace />;
  return <Outlet />;
}
