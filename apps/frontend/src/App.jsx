import {UnsavedChangesProvider} from './context/UnsavedChangesContext.jsx';
import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import GuestRoute from "./components/GuestRoute.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import { SocketProvider } from "./context/SocketContext.jsx";
import { useAuth } from "./hooks/useAuth.js";
import { useGlassLight } from "./hooks/useGlassLight.js";
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage.jsx"));
const LoginPage = lazy(() => import("./pages/LoginPage.jsx"));
const ProfilePage = lazy(() => import("./pages/ProfilePage.jsx"));
const RegisterPage = lazy(() => import("./pages/RegisterPage.jsx"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage.jsx"));
import AuthLayout from "./components/AuthLayout.jsx";
import SystemToasts from './components/shell/SystemToasts.jsx';
import AppShell from "./components/AppShell.jsx";
import ConversationsPage from "./pages/ConversationsPage.jsx";
const AmigosPage = lazy(() => import("./pages/AmigosPage.jsx"));
import CommunitiesLayout from "./context/CommunitiesContext.jsx";
import CommunitiesPage from "./pages/CommunitiesPage.jsx";
import CommunityPage from "./pages/CommunityPage.jsx";
const CommunityFormPage = lazy(() => import("./pages/CommunityFormPage.jsx"));
const CommunityRolesPage = lazy(() => import("./pages/CommunityRolesPage.jsx"));
const CommunityMembersPage = lazy(() => import("./pages/CommunityMembersPage.jsx"));
const CommunityInvitationsPage = lazy(() => import("./pages/CommunityInvitationsPage.jsx"));
const InvitationPage = lazy(() => import("./pages/InvitationPage.jsx"));
import CommunityChannelsPage from "./pages/CommunityChannelsPage.jsx";
const CommunityModerationPage = lazy(() => import("./pages/CommunityModerationPage.jsx"));

import './styles/pulido.css';

// La landing (WebGL y animaciones) solo se descarga si alguien entra a /inicio.
const LandingPage = lazy(() => import("./pages/LandingPage.jsx"));
const DevComponentsPage = import.meta.env.DEV ? lazy(() => import("./pages/DevComponentsPage.jsx")) : null;

export default function App() {
  const { estado, usuario } = useAuth();
  useGlassLight();

  return (
    <SocketProvider
      key={usuario?.id ?? "guest"}
      enabled={estado === "logueado"}
    >
      <UnsavedChangesProvider>
      <SystemToasts />
      <Suspense fallback={<div className="route-loading" role="status">Cargando vista…</div>}>
      <Routes>
        <Route element={<GuestRoute />}>
          <Route path="/inicio" element={<Suspense fallback={null}><LandingPage /></Suspense>} />
        </Route>
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
            <Route path="/comunidades" element={<CommunitiesLayout />}>
              <Route index element={<CommunitiesPage />} />
              <Route path="nueva" element={<CommunityFormPage />} />
              <Route path=":id" element={<CommunityPage />} />
              <Route path=":id/editar" element={<CommunityFormPage />} />
              <Route path=":id/roles" element={<CommunityRolesPage />} />
              <Route path=":id/integrantes" element={<CommunityMembersPage />} />
              <Route path=":id/invitaciones" element={<CommunityInvitationsPage />} />
              <Route path=":id/moderacion" element={<CommunityModerationPage />} />
              <Route path=":id/canales" element={<CommunityChannelsPage />} />
              <Route path=":id/canales/:canalId" element={<CommunityChannelsPage />} />
            </Route>
            <Route path="/invitacion" element={<CommunitiesLayout />}>
              <Route path=":codigo" element={<InvitationPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
        {DevComponentsPage && (
          <Route path="/dev/componentes" element={<Suspense><DevComponentsPage /></Suspense>} />
        )}
      </Routes>
      </Suspense>
      </UnsavedChangesProvider>
    </SocketProvider>
  );
}
