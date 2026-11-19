import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { PrivateCallProvider, usePrivateCall } from '../context/PrivateCallContext.jsx';
const mock=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),listeners:new Map(),socket:{on:vi.fn(),off:vi.fn()},channel:{canal:null},rooms:[],mic:vi.fn(),camera:vi.fn(),switchDevice:vi.fn()}));
vi.mock('../hooks/useSocket.js',()=>({useSocket:()=>mock.socket}));
vi.mock('../hooks/useAuth.js',()=>({useAuth:()=>({usuario:{id:1,preferencias:{audioInput:'saved'}}})}));
vi.mock('../hooks/useCall.js',()=>({useCall:()=>mock.channel}));
vi.mock('../services/api.js',()=>({api:{get:mock.get,post:mock.post}}));
vi.mock('livekit-client',()=>({
  Room:class{constructor(){this.remoteParticipants=new Map();this.localParticipant={identity:'usuario-1',name:'Ana',setMicrophoneEnabled:mock.mic,setCameraEnabled:mock.camera,getTrackPublication:()=>null};this.connect=vi.fn().mockResolvedValue();this.disconnect=vi.fn();this.removeAllListeners=vi.fn();this.on=vi.fn();this.startAudio=vi.fn().mockResolvedValue();this.switchActiveDevice=mock.switchDevice;mock.rooms.push(this);}},
  RoomEvent:{},Track:{Source:{Camera:'camera'},Kind:{Audio:'audio'}}
}));
vi.mock('../components/calls/CallStage.jsx',()=>({default:()=>null}));
function Child(){const call=usePrivateCall();return <button disabled={call.busy} onClick={()=>call.start(7,true)}>Iniciar video</button>;}
const incoming={id:'call-1',idEmisor:2,idReceptor:1,estado:'LLAMANDO',video:true,emisor:{nombreVisible:'Dani'},receptor:{nombreVisible:'Ana'}};
beforeEach(()=>{vi.clearAllMocks();mock.listeners.clear();mock.rooms.length=0;mock.channel.canal=null;mock.channel.estado='INACTIVO';mock.socket.on.mockImplementation((event,fn)=>mock.listeners.set(event,fn));mock.get.mockResolvedValue({llamada:null});mock.post.mockResolvedValue({});mock.mic.mockResolvedValue();mock.camera.mockResolvedValue();mock.switchDevice.mockResolvedValue();});
const show=()=>render(<PrivateCallProvider><Child/></PrivateCallProvider>);
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
