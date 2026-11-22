import ProfileExplorer from './shell/ProfileExplorer.jsx';
import '../styles/socialFeatures.css';
import '../styles/refinamiento.css';
import {ThemeSync} from './AppearanceSettings.jsx';
import '../styles/dark.css';
import {DraftsProvider} from '../context/DraftsContext.jsx';
import {Suspense} from 'react';
import {CallOriginProvider} from '../context/CallOriginContext.jsx';
import {ChatStateProvider} from '../context/ChatStateContext.jsx';
import { PrivateCallProvider } from '../context/PrivateCallContext.jsx';
import { useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { RightPanelContext } from './shell/RightPanel.jsx';
import { ConversationsProvider } from '../context/ConversationsContext.jsx';
import { CommunitiesProvider } from '../context/CommunitiesContext.jsx';
import { CallProvider } from '../context/CallContext.jsx';
import ActiveCallBar from './calls/ActiveCallBar.jsx';
import Sidebar from './shell/Sidebar.jsx';
import SystemToasts from './shell/SystemToasts.jsx';
import MobileNav from './shell/MobileNav.jsx';
import { useNotificationsSummary } from './shell/notificationsStore.js';
import './shell/shell.css';

function Shell() {
  const [slot, setSlot] = useState(null);
  const { expanded } = useNotificationsSummary();
  const { pathname } = useLocation();
  const home = pathname === '/';
  const chat = /^\/conversaciones\/[^/]+$/.test(pathname) || /^\/comunidades\/[^/]+\/canales\/\d+$/.test(pathname);
  return <div className={`shell ${home ? 'shell-home' : ''} ${chat ? 'shell-chat' : ''} ${expanded ? 'shell-activity' : ''}`}>
    <a className="skip-link" href="#contenido">Saltar al contenido</a>
    <ThemeSync/><Sidebar />
    <RightPanelContext.Provider value={slot}>
      <ProfileExplorer/><main id="contenido" className="win shell-main" tabIndex={-1}><ActiveCallBar /><Suspense fallback={<div className="route-loading" role="status">Cargando vista…</div>}><Outlet /></Suspense></main>
    </RightPanelContext.Provider>
    <div ref={setSlot} className="shell-right-slot" />
    {!chat && <MobileNav />}

  </div>;
}

export default function AppShell() {
  return <ConversationsProvider><CommunitiesProvider><ChatStateProvider><CallProvider><PrivateCallProvider><CallOriginProvider><DraftsProvider><Shell /></DraftsProvider></CallOriginProvider></PrivateCallProvider></CallProvider></ChatStateProvider></CommunitiesProvider></ConversationsProvider>;
}
