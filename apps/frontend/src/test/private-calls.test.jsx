import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import PrivateCallScene from '../components/calls/PrivateCallScene.jsx';
import { PrivateCallProvider, usePrivateCall } from '../context/PrivateCallContext.jsx';
const mock=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),listeners:new Map(),socket:{on:vi.fn(),off:vi.fn()},channel:{canal:null},rooms:[],mic:vi.fn(),camera:vi.fn(),switchDevice:vi.fn(),screen:vi.fn(),stage:vi.fn(),screenTrack:{attach:vi.fn(),detach:vi.fn()}}));
vi.mock('../hooks/useSocket.js',()=>({useSocket:()=>mock.socket}));
vi.mock('../hooks/useAuth.js',()=>({useAuth:()=>({usuario:{id:1,preferencias:{audioInput:'saved'}}})}));
vi.mock('../hooks/useCall.js',()=>({useCall:()=>mock.channel}));
vi.mock('../services/api.js',()=>({api:{get:mock.get,post:mock.post}}));
vi.mock('livekit-client',()=>({
  Room:class{constructor(){this.handlers=new Map();this.remoteParticipants=new Map();this.localParticipant={identity:'usuario-1',name:'Ana',isScreenShareEnabled:false,setMicrophoneEnabled:mock.mic,setCameraEnabled:mock.camera,getTrackPublication:source=>source==='screen'?{track:mock.screenTrack}:null,setScreenShareEnabled:async value=>{await mock.screen(value);this.localParticipant.isScreenShareEnabled=value;this.handlers.get('local-published')?.forEach(fn=>fn());}};this.connect=vi.fn().mockResolvedValue();this.disconnect=vi.fn();this.removeAllListeners=vi.fn();this.on=vi.fn((name,fn)=>{if(!this.handlers.has(name))this.handlers.set(name,[]);this.handlers.get(name).push(fn);});this.startAudio=vi.fn().mockResolvedValue();this.switchActiveDevice=mock.switchDevice;mock.rooms.push(this);}},
  RoomEvent:{LocalTrackPublished:'local-published',LocalTrackUnpublished:'local-unpublished',TrackSubscribed:'track-subscribed'},Track:{Source:{Camera:'camera',ScreenShare:'screen'},Kind:{Audio:'audio'}}
}));
vi.mock('../components/calls/CallStage.jsx',()=>({default:props=>{mock.stage(props);return null;}}));
function Child(){const call=usePrivateCall();return <button disabled={call.busy} onClick={()=>call.start(7,true)}>Iniciar video</button>;}
const incoming={id:'call-1',idConversacion:7,idEmisor:2,idReceptor:1,estado:'LLAMANDO',video:true,emisor:{nombreVisible:'Dani'},receptor:{nombreVisible:'Ana'}};
beforeEach(()=>{vi.clearAllMocks();mock.listeners.clear();mock.rooms.length=0;mock.channel.canal=null;mock.channel.estado='INACTIVO';mock.socket.on.mockImplementation((event,fn)=>mock.listeners.set(event,fn));mock.get.mockResolvedValue({llamada:null});mock.post.mockResolvedValue({});mock.mic.mockResolvedValue();mock.camera.mockResolvedValue();mock.switchDevice.mockResolvedValue();mock.screen.mockReset().mockResolvedValue();Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getDisplayMedia:vi.fn()}});});
const show=()=>render(<PrivateCallProvider><Child/><PrivateCallScene idConversacion={7}/></PrivateCallProvider>);
const receive=async(call)=>act(async()=>mock.listeners.get('private-call:changed')({llamada:call}));
test('una llamada entrante no activa dispositivos antes de aceptarla',async()=>{
  show();await receive(incoming);expect(screen.getByText('Llamada entrante')).toBeInTheDocument();expect(mock.rooms).toHaveLength(0);expect(mock.mic).not.toHaveBeenCalled();
  mock.post.mockImplementation(async(path)=>path.endsWith('/accept')?{llamada:{...incoming,estado:'ACEPTADA'}}:{url:'wss://example.test',token:'fake'});
  fireEvent.click(screen.getByText('Aceptar llamada'));
  await waitFor(()=>expect(mock.mic).toHaveBeenCalledWith(true));expect(mock.camera).toHaveBeenCalledWith(true);expect(mock.switchDevice).toHaveBeenCalledWith('audioinput','saved');
});
test('otra pestaña ve la aceptación pero no obtiene tokens ni abre otra conexión',async()=>{
  show();await receive({...incoming,estado:'ACEPTADA'});expect(screen.getByText('Llamada aceptada en otra pestaña.')).toBeInTheDocument();expect(mock.rooms).toHaveLength(0);expect(mock.post).not.toHaveBeenCalled();
});
test('rechazar conserva el estado y no inicia el proveedor',async()=>{
  show();await receive(incoming);fireEvent.click(screen.getByText('Rechazar'));
  await screen.findByText('Llamada rechazada');expect(mock.post).toHaveBeenCalledWith('/private-calls/call-1/end');expect(mock.rooms).toHaveLength(0);
});
test('estar en una llamada de canal impide iniciar una privada',async()=>{
  mock.channel.canal={id:9};mock.channel.estado='CONECTADO';show();fireEvent.click(screen.getByText('Iniciar video'));
  await screen.findByText('Salí primero de la llamada del canal.');expect(mock.post).not.toHaveBeenCalled();
});
test('un servidor ocupado muestra un error comprensible',async()=>{
  mock.post.mockRejectedValue(Object.assign(new Error('busy'),{code:'CALL_BUSY'}));show();fireEvent.click(screen.getByText('Iniciar video'));
  await screen.findByText('La persona está ocupada o ya tenés otra llamada.');expect(mock.rooms).toHaveLength(0);
});
test('un fallo de conexión termina la llamada y permite cerrar el aviso',async()=>{
  mock.post.mockImplementation(async(path)=>{if(path==='/private-calls')return {llamada:{...incoming,idEmisor:1,idReceptor:2}};if(path.endsWith('/token'))throw new Error('Proveedor no disponible');return {};});
  show();fireEvent.click(screen.getByText('Iniciar video'));await screen.findByText('Cancelar llamada');
  await receive({...incoming,idEmisor:1,idReceptor:2,estado:'ACEPTADA'});
  await screen.findByText('Proveedor no disponible');await waitFor(()=>expect(mock.post).toHaveBeenCalledWith('/private-calls/call-1/end'));
});

test('la pantalla privada actualiza el escenario local y el video remoto al suscribirse',async()=>{
 show();await receive(incoming);mock.post.mockImplementation(async path=>path.endsWith('/accept')?{llamada:{...incoming,estado:'ACEPTADA'}}:{url:'wss://example.test',token:'fake'});fireEvent.click(screen.getByText('Aceptar llamada'));await waitFor(()=>expect(mock.mic).toHaveBeenCalledWith(true));
 fireEvent.click(screen.getByRole('button',{name:'Compartir pantalla'}));await waitFor(()=>expect(mock.screen).toHaveBeenCalledWith(true));await waitFor(()=>expect(mock.stage.mock.calls.at(-1)[0].personas.some(p=>p.local&&p.videoPantalla===mock.screenTrack)).toBe(true));
 const room=mock.rooms[0],track={attach:vi.fn(),detach:vi.fn(),kind:'video'};room.remoteParticipants.set('usuario-2',{identity:'usuario-2',name:'Dani',isScreenShareEnabled:true,getTrackPublication:source=>source==='screen'?{track}:null});
 await act(async()=>room.handlers.get('track-subscribed').forEach(fn=>fn(track)));expect(mock.stage.mock.calls.at(-1)[0].personas.some(p=>!p.local&&p.videoPantalla===track)).toBe(true);
});
test('minimizar muestra el chat sin desconectar y permite restaurar la llamada',async()=>{
 function Restore(){const call=usePrivateCall();return call.chatVisible?<button onClick={call.showCall}>Restaurar llamada</button>:null;}
 render(<PrivateCallProvider><Restore/><PrivateCallScene idConversacion={7}/></PrivateCallProvider>);await receive(incoming);mock.post.mockImplementation(async path=>path.endsWith('/accept')?{llamada:{...incoming,estado:'ACEPTADA'}}:{url:'wss://example.test',token:'fake'});fireEvent.click(screen.getByText('Aceptar llamada'));await waitFor(()=>expect(mock.mic).toHaveBeenCalledWith(true));const room=mock.rooms[0];fireEvent.click(screen.getByRole('button',{name:'Ir al chat'}));expect(screen.queryByRole('region',{name:'Llamada privada'})).not.toBeInTheDocument();expect(room.disconnect).not.toHaveBeenCalled();fireEvent.click(screen.getByText('Restaurar llamada'));expect(screen.getByRole('region',{name:'Llamada privada'})).toBeInTheDocument();expect(mock.rooms).toHaveLength(1);expect(screen.queryByRole('button',{name:'Levantar la mano'})).not.toBeInTheDocument();
});
