import { NavLink, Outlet, useLocation } from 'react-router';
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { ConversationsProvider, useConversations } from '../context/ConversationsContext.jsx';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';

function Navigation({ mobile = false }) {
  const { pathname } = useLocation();
  return <nav className={mobile ? 'mobile-navigation' : 'top-navigation'} aria-label={mobile ? 'Navegación móvil' : 'Navegación principal'}>
    <NavLink to="/" end className={() => pathname === '/' || pathname.startsWith('/conversaciones/') ? 'active' : ''}>
      <Icon name="chat" /><span>Mensajes</span></NavLink>
    <NavLink to="/comunidades"><Icon name="communities" /><span>Comunidades</span></NavLink>
    <NavLink to="/amigos"><Icon name="people" /><span>Amigos</span></NavLink>
    <NavLink to="/perfil"><Icon name="profile" /><span>Perfil</span></NavLink>
  </nav>;
}
function Shell() {
  const { usuario, logout } = useAuth();
  const { connected } = useConversations();
  const [error, setError] = useState('');
  return <div className="app-layout sidebar-layout">
    <a className="skip-link" href="#contenido">Saltar al contenido</a>
    <header className="app-header">
      <NavLink to="/" className="wordmark" aria-label="Dialo, inicio"><span aria-hidden="true" className="brand-star">✳</span> dialo.</NavLink>
      <div className="sidebar-navigation"><p className="sidebar-caption">Tu espacio</p><Navigation /></div>
      <div className="header-account">
        <NavLink to="/perfil" className="header-profile" aria-label="Mi perfil"><Avatar usuario={usuario} /><span className="sidebar-identity"><strong>{usuario?.nombreVisible || usuario?.nombreUsuario}</strong><small>Ver mi perfil</small></span></NavLink>
        <span className="connection-status"><span className={`connection-dot ${connected ? 'online' : ''}`} />{connected ? 'Conectado' : 'Reconectando…'}</span>
        <button type="button" className="icon-button" title="Cerrar sesión" aria-label="Cerrar sesión" onClick={async () => {
          try { await logout(); } catch (e) { setError(e.message); }
        }}><Icon name="logout" /></button>
      </div>
    </header>
    {error && <p role="alert" className="notice error">{error}</p>}
    <main id="contenido" className="app-content" tabIndex={-1}><Outlet /></main>
    <Navigation mobile />
  </div>;
}
export default function AppShell() {
  return <ConversationsProvider><Shell /></ConversationsProvider>;
}
