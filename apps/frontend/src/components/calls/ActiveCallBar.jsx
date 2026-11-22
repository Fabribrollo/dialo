import Icon from '../ui/Icon.jsx';
import {useCallOrigin} from '../../context/CallOriginContext.jsx';
import Notice from '../ui/Notice.jsx';
import {useLocation} from 'react-router';
import {useCall} from '../../hooks/useCall.js';
import {usePrivateCall} from '../../context/PrivateCallContext.jsx';
import CallBar from './CallBar.jsx';
import {CameraButton,MicrophoneButton,ScreenButton} from './CallPanel.jsx';
export default function ActiveCallBar(){
 const call=useCall(),privateCall=usePrivateCall();const {pathname}=useLocation();const scene=useCallOrigin();const atOrigin=to=>scene?scene.origin===to:pathname===to;
 if(privateCall?.active){
  if(privateCall.incoming&&privateCall.call.estado==='LLAMANDO')return null;
  const to=`/conversaciones/${privateCall.call.idConversacion}`;if(atOrigin(to))return null;
  const adapter=privateCall.adapter;
  return <CallBar title={privateCall.other?.nombreVisible??'Llamada privada'} status={privateCall.connected?'En la llamada':'Conectando…'} desde={privateCall.desde} people={privateCall.people.length?privateCall.people:[privateCall.other??{}]} to={to} backLabel="Volver a la llamada" onReturn={privateCall.showCall} onEnd={privateCall.end} busy={privateCall.busy} controls={privateCall.connected&&<>{adapter.audioBloqueado&&<button type="button" className="ib call-ctl" aria-label="Activar audio" onClick={adapter.activarAudio}><Icon name="canalVoz" size={17}/></button>}<MicrophoneButton call={adapter} dark/><CameraButton call={adapter} dark/>{privateCall.canShare&&<ScreenButton call={adapter} dark/>}</>}/>;
 }
 if(call?.canal&&call.estado==='ERROR'&&pathname!==`/comunidades/${call.canal.idComunidad}/canales/${call.canal.id}`)return <Notice title={call.error?.message??'Llamada interrumpida'}/>;
 if(!call?.canal||!['CONECTANDO','CONECTADO','RECONECTANDO','SALIENDO'].includes(call.estado))return null;
 const to=`/comunidades/${call.canal.idComunidad}/canales/${call.canal.id}`;if(atOrigin(to))return null;
 return <CallBar title={call.canal.nombre} status={call.estado==='CONECTADO'?'En la llamada':'Conectando…'} desde={call.desde} people={call.participantes} to={to} backLabel="Volver al canal" onEnd={call.salir} busy={call.estado==='SALIENDO'} controls={<>{call.misPermisos.includes('HABLAR')&&<MicrophoneButton call={call} dark/>}{(call.misPermisos.includes('CAMARA')||call.misPermisos.includes('TRANSMITIR'))&&<CameraButton call={call} dark/>}{call.puedeCompartirPantalla&&(call.misPermisos.includes('PANTALLA')||call.misPermisos.includes('TRANSMITIR'))&&<ScreenButton call={call} dark/>}</>}/>;
}
