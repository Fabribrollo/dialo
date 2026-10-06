import { NavLink, Outlet, useLocation } from "react-router";
import { useState } from "react";
import { useAuth } from "../hooks/useAuth.js";
import {
  ConversationsProvider,
  useConversations,
} from "../context/ConversationsContext.jsx";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";
function Shell() {
  const { pathname } = useLocation();
  const { usuario, logout } = useAuth();
  const { connected } = useConversations();
  const [error, setError] = useState("");
  return (
    <div className="app-layout">
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <aside className="app-rail">
        <NavLink
          to="/"
          className="brand-mark"
          aria-label="Dialo, conversaciones"
        >
          <Icon name="star" />
        </NavLink>
        <nav aria-label="Navegación principal">
          <NavLink
            to="/"
            end
            className={() =>
              pathname === "/" || pathname.startsWith("/conversaciones/")
                ? "active"
                : ""
            }
            title="Conversaciones"
            aria-label="Conversaciones"
          >
            <Icon name="chat" />
            <span>Chats</span>
          </NavLink>
          <NavLink to="/amigos" title="Amigos" aria-label="Amigos">
            <Icon name="people" />
            <span>Amigos</span>
          </NavLink>
          <NavLink to="/perfil" title="Mi perfil" aria-label="Mi perfil">
            <Icon name="profile" />
            <span>Perfil</span>
          </NavLink>
        </nav>
        <div className="rail-bottom">
          <Avatar usuario={usuario} />
          <button
            className="icon-button"
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            onClick={async () => {
              try {
                await logout();
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            <Icon name="logout" />
          </button>
        </div>
      </aside>
      <div className="app-workspace">
        <header className="app-header">
          <span className="wordmark">
            dialo<span className="brand-dot">.</span>
          </span>
          <div>
            <span className={`connection-dot ${connected ? "online" : ""}`} />
            <span>{connected ? "Conectado" : "Reconectando…"}</span>
            <span className="header-user">@{usuario.nombreUsuario}</span>
          </div>
        </header>
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        <main id="contenido" className="app-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
export default function AppShell() {
  return (
    <ConversationsProvider>
      <Shell />
    </ConversationsProvider>
  );
}
