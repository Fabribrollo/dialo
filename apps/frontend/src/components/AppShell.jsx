import { PrivateCallProvider } from '../context/PrivateCallContext.jsx';
import ActivityCenter from './shell/ActivityCenter.jsx';
import { useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { RightPanelContext } from './shell/RightPanel.jsx';
import { ConversationsProvider } from '../context/ConversationsContext.jsx';
import { CommunitiesProvider } from '../context/CommunitiesContext.jsx';
import { CallProvider } from '../context/CallContext.jsx';
import ActiveCallBar from './calls/ActiveCallBar.jsx';
import Sidebar from './shell/Sidebar.jsx';
import MobileNav from './shell/MobileNav.jsx';
import './shell/shell.css';

function Shell() {
  const [slot, setSlot] = useState(null);
  const { pathname } = useLocation();
  const home = pathname === '/';
  const chat = /^\/conversaciones\/[^/]+$/.test(pathname) || /^\/comunidades\/[^/]+\/canales\/\d+$/.test(pathname);
  return <div className={`shell ${home ? 'shell-home' : ''} ${chat ? 'shell-chat' : ''}`}>
    <a className="skip-link" href="#contenido">Saltar al contenido</a>
    <Sidebar />
    <RightPanelContext.Provider value={slot}>
      <main id="contenido" className="win shell-main" tabIndex={-1}><ActiveCallBar /><ActivityCenter /><Outlet /></main>
    </RightPanelContext.Provider>
    <div ref={setSlot} className="shell-right-slot" />
    {!chat && <MobileNav />}
  </div>;
}

export default function AppShell() {
  return <ConversationsProvider><CommunitiesProvider><CallProvider><PrivateCallProvider><Shell /></PrivateCallProvider></CallProvider></CommunitiesProvider></ConversationsProvider>;
}
