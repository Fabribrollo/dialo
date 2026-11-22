import {useCallScene} from '../../context/CallOriginContext.jsx';
import {usePrivateCall} from '../../context/PrivateCallContext.jsx';
import Avatar from '../ui/Avatar.jsx';
import Button from '../ui/Button.jsx';
import CallStage from './CallStage.jsx';
import {CameraButton,MicrophoneButton,ScreenButton} from './CallPanel.jsx';
import './callBar.css';
export default function PrivateCallScene({idConversacion}){
 const c=usePrivateCall();useCallScene(`/conversaciones/${idConversacion}`,Boolean(c?.active&&c.call?.idConversacion===idConversacion&&!c.chatVisible&&!(c.incoming&&c.call.estado==='LLAMANDO')));if(c?.chatVisible||!c?.active||c.call?.idConversacion!==idConversacion||(c.incoming&&c.call.estado==='LLAMANDO'))return null;
 return <section className="private-call-scene" aria-label="Llamada privada"><header className="private-call-heading"><h2>{c.connected?'Llamada en curso':c.acceptedElsewhere?'Llamada en otro dispositivo':c.call.estado==='LLAMANDO'?'Llamando…':'Conectando…'}</h2><Button variant="secundario" onClick={c.showChat}>Ir al chat</Button></header>
 {c.connected?<CallStage personas={c.people} onStopShare={c.adapter.alternarPantalla}/>:<div className="private-call-status"><Avatar nombre={c.other?.nombreVisible} foto={c.other?.fotoUrl} size={58}/><strong>{c.other?.nombreVisible}</strong></div>}
 {c.acceptedElsewhere&&<p>Llamada aceptada en otra pestaña.</p>}<div className="private-call-actions">{c.connected&&<>{c.adapter.audioBloqueado&&<Button onClick={c.adapter.activarAudio}>Activar audio</Button>}<MicrophoneButton call={c.adapter}/><CameraButton call={c.adapter}/>{c.canShare&&<ScreenButton call={c.adapter}/>}</>}{c.incoming&&c.call.estado==='LLAMANDO'&&<Button onClick={c.accept}>Aceptar llamada</Button>}<Button variant="peligro" disabled={c.busy} onClick={c.end}>{c.call.estado==='LLAMANDO'?'Cancelar llamada':'Finalizar llamada'}</Button></div>
 </section>;
}
