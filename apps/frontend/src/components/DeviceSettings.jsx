import { usePrivateCall } from '../context/PrivateCallContext.jsx';
import { useContext, useState } from 'react';
import { CallContext } from '../context/CallContext.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { api } from '../services/api.js';
import Button from './ui/Button.jsx';
import Field from './ui/Field.jsx';

export default function DeviceSettings() {
  const { usuario, setUsuario } = useAuth(), call = useContext(CallContext), privateCall = usePrivateCall();
  const [prefs, setPrefs] = useState(usuario.preferencias || {}), [devices, setDevices] = useState([]), [busy,setBusy] = useState(false), [message,setMessage] = useState('');
  async function discover() {
    setMessage('');
    try {
      // Solo se enumeran dispositivos: no encendemos micrófono o cámara.
      setDevices(await navigator.mediaDevices.enumerateDevices());
    } catch { setMessage('No se pudieron consultar los dispositivos. Revisá los permisos del navegador.'); }
  }
  async function save() {
    if(busy)return; setBusy(true);setMessage('');
    try {
      const { usuario: user } = await api.patch('/users/me/preferences', { silenciarNotificaciones:!!prefs.silenciarNotificaciones, audioInput:prefs.audioInput||'', audioOutput:prefs.audioOutput||'', videoInput:prefs.videoInput||'' });
      setUsuario(user);
      let failed=false;
      for(const [kind,key] of [['audioinput','audioInput'],['audiooutput','audioOutput'],['videoinput','videoInput']]) {
        for(const active of [call,privateCall]) {
          try { await active?.elegirDispositivo?.(kind,prefs[key]||'default'); } catch { failed=true; }
        }
      }
      setMessage(failed?'Preferencias guardadas. No se pudo cambiar uno de los dispositivos de la llamada actual.':'Preferencias guardadas.');
    } catch(e) {setMessage(e.message);} finally {setBusy(false);}
  }
  return <section className="device-settings"><h2>Notificaciones y dispositivos</h2>
    <label><input type="checkbox" checked={!!prefs.silenciarNotificaciones} onChange={(e)=>setPrefs({...prefs,silenciarNotificaciones:e.target.checked})} /> Silenciar nuevas notificaciones</label>
    <Button variant="secundario" onClick={discover}>Consultar dispositivos</Button>
    <p>El navegador puede ocultar nombres hasta que autorices el dispositivo en una llamada. La selección de salida depende de tu navegador.</p>
    {[['audioinput','audioInput','Micrófono'],['audiooutput','audioOutput','Salida de audio'],['videoinput','videoInput','Cámara']].map(([kind,key,label])=>
      <Field key={key} as="select" label={label} value={prefs[key]||''} onChange={(e)=>setPrefs({...prefs,[key]:e.target.value})}>
        <option value="">Predeterminado del sistema</option>{devices.filter((d)=>d.kind===kind&&d.deviceId).map((d,i)=><option key={d.deviceId} value={d.deviceId}>{d.label||`${label} ${i+1}`}</option>)}
      </Field>)}
    {message&&<p role="status">{message}</p>}
    <Button loading={busy} onClick={save}>Guardar preferencias</Button>
  </section>;
}
