import { Navigate, Route, Routes } from "react-router";
import GuestRoute from "./components/GuestRoute.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import { SocketProvider } from "./context/SocketContext.jsx";
import { useAuth } from "./hooks/useAuth.js";
import ForgotPasswordPage from "./pages/ForgotPasswordPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import ResetPasswordPage from "./pages/ResetPasswordPage.jsx";
import AuthLayout from "./components/AuthLayout.jsx";
import AppShell from "./components/AppShell.jsx";
import ConversationsPage from "./pages/ConversationsPage.jsx";
import AmigosPage from "./pages/AmigosPage.jsx";

export default function App() {
  const { estado, usuario } = useAuth();

  return (
    <SocketProvider
      key={usuario?.id ?? "guest"}
      enabled={estado === "logueado"}
    >
      <Routes>
        <Route element={<AuthLayout />}>
          <Route element={<GuestRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<ConversationsPage />} />
            <Route path="/conversaciones/:id" element={<ConversationsPage />} />
            <Route path="/perfil" element={<ProfilePage />} />
            <Route path="/amigos" element={<AmigosPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </SocketProvider>
  );
}
