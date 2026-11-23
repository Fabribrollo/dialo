import { enabled, supported, setEnabled } from '../utils/browserNotifications.js';
import { avisar } from './shell/systemToastsStore.js';
import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { api } from '../services/api.js';
import Notice from './ui/Notice.jsx';

export default function DeviceSettings() {
  const { usuario, setUsuario } = useAuth();
  const [prefs, setPrefs] = useState(usuario.preferencias || {}), [busy,setBusy] = useState(false), [message,setMessage] = useState('');
  const [browser,setBrowser]=useState(enabled),[permission,setPermission]=useState(()=>supported()?Notification.permission:'unsupported');
  useEffect(()=>{const sync=()=>{setBrowser(enabled());setPermission(supported()?Notification.permission:'unsupported');};window.addEventListener('storage',sync);window.addEventListener('focus',sync);return()=>{window.removeEventListener('storage',sync);window.removeEventListener('focus',sync);};},[]);
  async function toggleBrowser(){
    if(browser){setEnabled(false);setBrowser(false);return;}
    try{const result=await Notification.requestPermission();
    if(result==='granted'&&'serviceWorker' in navigator)await navigator.serviceWorker.register('/notifications-sw.js').catch(()=>{});setPermission(result);setEnabled(result==='granted');setBrowser(result==='granted');}
    catch{setMessage('No se pudieron habilitar los avisos del navegador.');}
  }
  async function toggleSilence(){
    if(busy)return;setBusy(true);const next={...prefs,silenciarNotificaciones:!prefs.silenciarNotificaciones};
    try{const {usuario:user}=await api.patch('/users/me/preferences',{silenciarNotificaciones:!!next.silenciarNotificaciones,audioInput:next.audioInput||'',audioOutput:next.audioOutput||'',videoInput:next.videoInput||''});setUsuario(user);setPrefs(next);avisar({texto:next.silenciarNotificaciones?'Notificaciones desactivadas.':'Notificaciones activadas.'});}catch(e){avisar({tipo:'error',texto:e.message});}finally{setBusy(false);}
  }
  return <section className="set-card notification-settings" aria-labelledby="notif-titulo"><header className="set-head"><h2 id="notif-titulo">Notificaciones</h2><p>Avisos de mensajes, menciones y llamadas.</p></header>
    <button type="button" className="setting-toggle" role="switch" aria-checked={browser} disabled={permission==='denied'||permission==='unsupported'} onClick={toggleBrowser}><span><strong>Avisos del navegador o sistema</strong><small>{permission==='unsupported'?'No disponibles en este navegador. En móvil puede requerir instalar Dialo.':permission==='denied'?'Habilitalos desde los permisos del sitio.':'Avisos cuando Dialo está en segundo plano.'}</small></span><span className={`act-toggle ${browser?'on':''}`} aria-hidden="true"/></button>
    <button type="button" className="setting-toggle" role="switch" aria-checked={!!prefs.silenciarNotificaciones} disabled={busy} onClick={toggleSilence}><span><strong>Desactivar notificaciones</strong><small>Silencia avisos y tonos de llamadas.</small></span><span className={`act-toggle ${prefs.silenciarNotificaciones?'on':''}`} aria-hidden="true"/></button>
    {message&&<Notice title={message}/>}
  </section>;
}
