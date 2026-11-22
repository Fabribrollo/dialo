import {CallOriginProvider,useCallScene} from '../context/CallOriginContext.jsx';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import CallPanel from '../components/calls/CallPanel.jsx';
import ActiveCallBar from '../components/calls/ActiveCallBar.jsx';
import { formatCallTime } from '../hooks/useCallTime.js';
import { useCall } from '../hooks/useCall.js';
import { useSocket } from '../hooks/useSocket.js';
import { getCallParticipants } from '../services/callsService.js';
import { channelSubscription } from '../services/channelSubscriptions.js';

vi.mock('../hooks/useCall.js', () => ({ useCall: vi.fn() }));
vi.mock('../hooks/useSocket.js', () => ({ useSocket: vi.fn() }));
vi.mock('../services/callsService.js', () => ({ getCallParticipants: vi.fn() }));
vi.mock('../services/channelSubscriptions.js', () => ({ channelSubscription: vi.fn() }));

const canal = { id: 2, idComunidad: 4, nombre: 'charla', tipo: 'VOZ', misPermisos: ['VER', 'HABLAR'] };
const usuario = (id, nombreVisible) => ({ id, nombreVisible, nombreUsuario: nombreVisible.toLowerCase() });
let listeners, call;

function emit(evento, data) { act(() => listeners.get(evento)?.forEach((fn) => fn(data))); }
function base(extra = {}) {
  return {
    estado: 'DESCONECTADO', canal: null, error: null, misPermisos: [], participantes: [], microfono: false, camara: false, audioBloqueado: false, desde: null,
    entrar: vi.fn(), salir: vi.fn(), alternarMicrofono: vi.fn(), alternarCamara: vi.fn(), alternarPantalla: vi.fn(), pantalla: false, puedeCompartirPantalla: true, activarAudio: vi.fn(), ...extra,
  };
}
function setCall(extra) { call = base(extra); useCall.mockReturnValue(call); }
function show(c = canal) { return render(<CallPanel canal={c} />); }
const settle = () => act(async () => {});
const grilla = () => screen.getByRole('group', { name: 'Video de la llamada' });
const tiles = () => [...grilla().querySelectorAll('figure.ct')];
const nombres = () => tiles().map((f) => f.querySelector('figcaption').textContent);

beforeEach(() => {
  listeners = new Map();
  useSocket.mockReturnValue({
    connected: true,
    on: (n, fn) => { if (!listeners.has(n)) listeners.set(n, new Set()); listeners.get(n).add(fn); },
    off: (n, fn) => listeners.get(n)?.delete(fn),
  });
  channelSubscription.mockResolvedValue({ canal });
  getCallParticipants.mockResolvedValue({ items: [] });
  setCall();
});

it('sin nadie conectado invita a unirse y no muestra el micrófono', async () => {
  show();
  expect(await screen.findByRole('heading', { name: 'Todavía no hay nadie conectado' })).toBeInTheDocument();
  expect(screen.getByText('Entrá y los demás te van a ver en la lista.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /micrófono/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Unirme a la llamada' }));
  expect(call.entrar).toHaveBeenCalledWith(canal);
});

it('fuera de la llamada cuenta quién está conectado y se actualiza por socket', async () => {
  getCallParticipants.mockResolvedValue({ items: [{ usuario: usuario(7, 'Ana'), desde: '2026-11-10T00:00:00Z' }] });
  const { unmount } = show();
  expect(await screen.findByRole('heading', { name: 'No estás en esta llamada' })).toBeInTheDocument();
  expect(screen.getByText('Hay 1 persona conectada.')).toBeInTheDocument();
  expect(channelSubscription).toHaveBeenCalledWith(expect.anything(), 'channel:subscribe', 2);
  emit('call:participant-joined', { idCanal: 2, participante: { usuario: usuario(8, 'Beto') } });
  emit('call:participant-joined', { idCanal: 9, participante: { usuario: usuario(10, 'Otro') } });
  expect(screen.getByText('Hay 2 personas conectadas.')).toBeInTheDocument();
  emit('call:participant-left', { idCanal: 2, idUsuario: 7 });
  expect(screen.getByText('Hay 1 persona conectada.')).toBeInTheDocument();
  unmount();
  expect(channelSubscription).toHaveBeenCalledWith(expect.anything(), 'channel:unsubscribe', 2);
});

it('solo con VER avisa que entra para escuchar y ver', async () => {
  getCallParticipants.mockResolvedValue({ items: [{ usuario: usuario(7, 'Ana') }] });
  show({ ...canal, misPermisos: ['VER'] });
  expect(await screen.findByText('Entrás para escuchar y ver.')).toBeInTheDocument();
});

it('distingue quién habla de quién tiene el micrófono abierto', async () => {
  getCallParticipants.mockResolvedValue({ items: [{ usuario: usuario(7, 'Ana') }, { usuario: usuario(8, 'Beto') }, { usuario: usuario(9, 'Caro') }] });
  setCall({ estado: 'CONECTADO', canal, misPermisos: ['VER', 'HABLAR'], participantes: [
    { idUsuario: 7, nombre: 'Ana', microfono: true, hablando: true },
    { idUsuario: 8, nombre: 'Beto', microfono: true, hablando: false },
    { idUsuario: 9, nombre: 'Caro', microfono: false, hablando: false },
  ] });
  show();
  await screen.findByText('Caro');
  expect(nombres()).toEqual(['Ana', 'Beto', 'Caro']);
  expect(screen.getByText('Ana está hablando')).toBeInTheDocument();
  expect(within(tiles()[2]).getByRole('img', { name: 'Silenciado' })).toBeInTheDocument();
  expect(within(tiles()[1]).queryByRole('img', { name: 'Silenciado' })).not.toBeInTheDocument();
  expect(tiles()[0]).toHaveClass('is-speaking');
  expect(tiles()[1]).not.toHaveClass('is-speaking');
});

it('suma participantes de LiveKit que el back todavía no confirmó', async () => {
  setCall({ estado: 'CONECTADO', canal, misPermisos: ['VER', 'HABLAR'], participantes: [{ idUsuario: 1, nombre: 'Fabri', local: true, microfono: false, hablando: false }] });
  show();
  await settle();
  expect(nombres()).toEqual(['Fabri (vos)']);
});

it('en llamada la pastilla muestra estado, tiempo, micrófono y salida', async () => {
  setCall({ estado: 'CONECTADO', canal, misPermisos: ['VER', 'HABLAR'], desde: Date.now() - 65000 });
  show();
  expect(screen.getByRole('status')).toHaveTextContent('Estás en la llamada');
  expect(screen.getByText('charla · 01:05')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Activar micrófono' }));
  expect(call.alternarMicrofono).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Salir de la llamada' }));
  expect(call.salir).toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Unirme a la llamada' })).not.toBeInTheDocument();
  await settle();
});

it('formatea el tiempo de llamada', () => {
  expect(formatCallTime(0)).toBe('00:00');
  expect(formatCallTime(728000)).toBe('12:08');
  expect(formatCallTime(3725000)).toBe('1:02:05');
});

it('solo recepción: puede estar en la llamada pero nunca ve el micrófono', async () => {
  const soloVer = { ...canal, misPermisos: ['VER'] };
  setCall({ estado: 'CONECTADO', canal: soloVer, misPermisos: ['VER'] });
  show(soloVer);
  expect(screen.getByText('Podés escuchar y ver, pero no hablar')).toBeInTheDocument();
  expect(screen.getByText('En este canal no tenés permiso para usar el micrófono.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /micrófono/ })).not.toBeInTheDocument();
  await settle();
});

it('si le sacan HABLAR durante la llamada el botón desaparece', async () => {
  setCall({ estado: 'CONECTADO', canal, misPermisos: ['VER', 'HABLAR'] });
  const { rerender } = show();
  expect(screen.getByRole('button', { name: 'Activar micrófono' })).toBeInTheDocument();
  rerender(<CallPanel canal={{ ...canal, misPermisos: ['VER'] }} />);
  expect(screen.queryByRole('button', { name: /micrófono/ })).not.toBeInTheDocument();
  await settle();
});

it.each([
  ['CONECTANDO', 'Conectando a la llamada…'],
  ['RECONECTANDO', 'Se cortó la conexión. Reconectando…'],
])('diferencia el estado %s', async (estado, texto) => {
  setCall({ estado, canal, misPermisos: ['VER', 'HABLAR'] });
  show();
  expect(screen.getByRole('status')).toHaveTextContent(texto);
  expect(screen.getByRole('button', { name: 'Activar micrófono' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Unirme a la llamada' })).not.toBeInTheDocument();
  await settle();
});

it('una llamada interrumpida permite reintentar o cerrar', async () => {
  setCall({ estado: 'ERROR', canal, error: { code: 'MEDIA_UNAVAILABLE', message: 'Las llamadas no estan disponibles en este momento' } });
  show();
  expect(screen.getByRole('heading', { name: 'Llamada interrumpida' })).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Las llamadas no estan disponibles en este momento');
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(call.entrar).toHaveBeenCalledWith(canal);
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
  expect(call.salir).toHaveBeenCalled();
  await settle();
});

it('si no conecta con el servidor lo dice con el texto del tablero', async () => {
  setCall({ estado: 'ERROR', canal, error: { code: 'CALL_CONNECTION_FAILED', message: 'x' } });
  show();
  expect(screen.getByRole('heading', { name: 'No se pudo conectar con el servidor de llamadas' })).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Probá de nuevo en unos segundos');
  await settle();
});

it('ALREADY_IN_CALL ofrece salir de la otra llamada', async () => {
  setCall({ estado: 'ERROR', canal, error: { code: 'ALREADY_IN_CALL', message: 'Ya estas en otra llamada' } });
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Salir de la otra llamada y unirme' }));
  expect(call.entrar).toHaveBeenCalledWith(canal, { reemplazar: true });
  await settle();
});

it('estando en otra llamada ofrece cambiar', async () => {
  setCall({ estado: 'CONECTADO', canal: { ...canal, id: 3, nombre: 'reunión' }, misPermisos: ['VER', 'HABLAR'] });
  show();
  expect(screen.getByRole('heading', { name: 'Estás en la llamada de «reunión»' })).toBeInTheDocument();
  expect(screen.getByText('Solo podés estar en una a la vez')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /micrófono/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cambiar a esta llamada' }));
  expect(call.entrar).toHaveBeenCalledWith(canal);
  await settle();
});

it('si el navegador bloquea el audio ofrece activarlo', async () => {
  setCall({ estado: 'CONECTADO', canal, misPermisos: ['VER'], audioBloqueado: true });
  show();
  expect(screen.getByText('El navegador frenó el audio')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Activar audio' }));
  expect(call.activarAudio).toHaveBeenCalled();
  await settle();
});

it.each([
  ['MICROPHONE_ERROR', 'No pudimos usar tu micrófono', 'alternarMicrofono'],
  ['CAMERA_ERROR', 'No pudimos usar tu cámara', 'alternarCamara'],
  ['SCREEN_ERROR', 'No pudimos compartir tu pantalla', 'alternarPantalla'],
])('un error de dispositivo %s se explica y deja reintentar', async (code, titulo, accion) => {
  setCall({ estado: 'CONECTADO', canal, misPermisos: ['VER', 'HABLAR'], error: { code, message: 'Está ocupado por otra aplicación.' } });
  show();
  const aviso = screen.getByRole('alert');
  expect(aviso).toHaveTextContent(titulo);
  expect(aviso).toHaveTextContent('Está ocupado por otra aplicación.');
  fireEvent.click(within(aviso).getByRole('button', { name: 'Reintentar' }));
  expect(call[accion]).toHaveBeenCalled();
  await settle();
});

function showBar(path) {
  return render(<MemoryRouter initialEntries={[path]}><ActiveCallBar /></MemoryRouter>);
}

it('la barra de llamada aparece fuera del canal con salida visible', () => {
  setCall({ estado: 'CONECTADO', canal, misPermisos: ['VER', 'HABLAR'] });
  showBar('/amigos');
  const barra = screen.getByRole('complementary', { name: 'Llamada activa' });
  expect(within(barra).getByText('charla')).toBeInTheDocument();
  expect(within(barra).getByRole('link', { name: 'Volver al canal' })).toHaveAttribute('href', '/comunidades/4/canales/2');
  fireEvent.click(within(barra).getByRole('button', { name: 'Activar micrófono' }));
  fireEvent.click(within(barra).getByRole('button', { name: 'Finalizar llamada' }));
  expect(call.alternarMicrofono).toHaveBeenCalled();
  expect(call.salir).toHaveBeenCalled();
});

it('la barra muestra como máximo tres avatares sin desplegable',()=>{
 setCall({estado:'CONECTADO',canal,misPermisos:['VER'],participantes:Array.from({length:5},(_,i)=>({idUsuario:i+1,nombre:`Persona ${i}`}))});showBar('/amigos');
 const bar=screen.getByRole('complementary',{name:'Llamada activa'});expect(bar.querySelectorAll('.av')).toHaveLength(3);expect(bar.querySelector('[aria-expanded]')).toBeNull();expect(screen.queryByRole('list',{name:'En la llamada'})).not.toBeInTheDocument();
});

it('la barra no se muestra sin llamada ni dentro del propio canal', () => {
  showBar('/amigos');
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  setCall({ estado: 'CONECTADO', canal, misPermisos: ['VER'] });
  showBar('/comunidades/4/canales/2');
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
});

it('una llamada interrumpida usa el popup común y no reserva una barra',()=>{
 setCall({estado:'ERROR',canal,error:{message:'La llamada terminó.'}});showBar('/');expect(screen.getByText('La llamada terminó.')).toBeInTheDocument();expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
});

const transmite = { ...canal, misPermisos: ['VER', 'HABLAR', 'TRANSMITIR'] };
const pista = () => ({ attach: vi.fn(), detach: vi.fn() });

it('con TRANSMITIR ofrece encender la cámara; sin él no', async () => {
  setCall({ estado: 'CONECTADO', canal: transmite, misPermisos: transmite.misPermisos });
  const { rerender } = show(transmite);
  fireEvent.click(screen.getByRole('button', { name: 'Encender cámara' }));
  expect(call.alternarCamara).toHaveBeenCalled();
  setCall({ estado: 'CONECTADO', canal: transmite, misPermisos: transmite.misPermisos, camara: true });
  rerender(<CallPanel canal={transmite} />);
  expect(screen.getByRole('button', { name: 'Apagar cámara' })).toBeInTheDocument();
  rerender(<CallPanel canal={canal} />);
  expect(screen.queryByRole('button', { name: /^(Encender|Apagar) cámara/ })).not.toBeInTheDocument();
  await settle();
});

it('muestra el video de los demás y un avatar para quien no tiene cámara', async () => {
  const deAna = pista();
  setCall({ estado: 'CONECTADO', canal, misPermisos: ['VER', 'HABLAR'], participantes: [
    { idUsuario: 1, nombre: 'Fabri', local: true, microfono: true, hablando: false, camara: false, video: null },
    { idUsuario: 7, nombre: 'Ana', microfono: true, hablando: true, camara: true, video: deAna },
  ] });
  const { unmount } = show();
  const video = within(grilla()).getByLabelText('Cámara de Ana');
  expect(deAna.attach).toHaveBeenCalledWith(video);
  expect(video.muted).toBe(true);
  expect(nombres()).toEqual(['Fabri (vos)', 'Ana']);
  expect(tiles()[0].querySelector('video')).toBeNull();
  expect(screen.queryByRole('button', { name: /^(Encender|Apagar) cámara/ })).not.toBeInTheDocument();
  await settle();
  unmount();
  expect(deAna.detach).toHaveBeenCalledWith(video);
});

it('al apagarse una cámara se suelta su video y queda el avatar', async () => {
  const deAna = pista();
  const con = [{ idUsuario: 7, nombre: 'Ana', camara: true, video: deAna }];
  setCall({ estado: 'CONECTADO', canal, misPermisos: ['VER'], participantes: con });
  const { rerender } = show();
  const video = screen.getByLabelText('Cámara de Ana');
  setCall({ estado: 'CONECTADO', canal, misPermisos: ['VER'], participantes: [{ ...con[0], camara: false, video: null }] });
  rerender(<CallPanel canal={canal} />);
  expect(deAna.detach).toHaveBeenCalledWith(video);
  expect(screen.queryByLabelText('Cámara de Ana')).not.toBeInTheDocument();
  expect(nombres()).toEqual(['Ana']);
  await settle();
});

it('la grilla muestra 8 y +N con 10 o más, y Ver todos los muestra', async () => {
  const gente = Array.from({ length: 12 }, (_, i) => ({ idUsuario: i + 1, nombre: `P${i + 1}`, microfono: true }));
  setCall({ estado: 'CONECTADO', canal, misPermisos: ['VER'], participantes: gente });
  show();
  await settle();
  expect(tiles()).toHaveLength(8);
  fireEvent.click(within(grilla()).getByRole('button', { name: /\+4/ }));
  expect(tiles()).toHaveLength(12);
});

it('la pantalla compartida va primero y Ver cámaras pasa a la grilla', async () => {
  const deAna = pista();
  setCall({ estado: 'CONECTADO', canal: transmite, misPermisos: transmite.misPermisos, participantes: [
    { idUsuario: 1, nombre: 'Fabri', local: true, microfono: true },
    { idUsuario: 7, nombre: 'Ana', microfono: true, hablando: false, camara: false, video: null, pantalla: true, videoPantalla: deAna },
  ] });
  show(transmite);
  fireEvent.click(screen.getByRole('button', { name: 'Compartir pantalla' }));
  expect(call.alternarPantalla).toHaveBeenCalled();
  const video = screen.getByLabelText('Pantalla de Ana');
  expect(deAna.attach).toHaveBeenCalledWith(video);
  expect(screen.getByRole('button', { name: 'Activar micrófono' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Encender cámara' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ver cámaras' }));
  expect(screen.queryByLabelText('Pantalla de Ana')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ver pantalla de Ana' }));
  expect(screen.getByLabelText('Pantalla de Ana')).toBeInTheDocument();
  await settle();
});

it('quien comparte no ve su propia pantalla en espejo y puede cortarla desde ahí', async () => {
  setCall({ estado: 'CONECTADO', canal: transmite, misPermisos: transmite.misPermisos, pantalla: true, participantes: [
    { idUsuario: 1, nombre: 'Fabri', local: true, microfono: true, pantalla: true, videoPantalla: pista() },
    { idUsuario: 7, nombre: 'Ana', microfono: false },
  ] });
  show(transmite);
  expect(screen.getByText('Estás compartiendo tu pantalla')).toBeInTheDocument();
  expect(screen.queryByLabelText('Pantalla de Fabri')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Dejar de compartir pantalla' }));
  expect(call.alternarPantalla).toHaveBeenCalled();
  await settle();
});

it('con dos pantallas compartidas se puede elegir cuál ver', async () => {
  setCall({ estado: 'CONECTADO', canal: transmite, misPermisos: transmite.misPermisos, participantes: [
    { idUsuario: 1, nombre: 'Fabri', local: true, microfono: true },
    { idUsuario: 7, nombre: 'Ana', microfono: true, pantalla: true, videoPantalla: pista() },
    { idUsuario: 8, nombre: 'Beto', microfono: true, pantalla: true, videoPantalla: pista() },
  ] });
  show(transmite);
  expect(screen.getByLabelText('Pantalla de Ana')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ver la de Beto' }));
  expect(screen.getByLabelText('Pantalla de Beto')).toBeInTheDocument();
  await settle();
});

it('un navegador sin soporte explica en vez de ofrecer el botón', async () => {
  setCall({ estado: 'CONECTADO', canal: transmite, misPermisos: transmite.misPermisos, puedeCompartirPantalla: false });
  show(transmite);
  expect(screen.queryByRole('button', { name: 'Compartir pantalla' })).not.toBeInTheDocument();
  expect(screen.getByText('Este navegador no permite compartir pantalla')).toBeInTheDocument();
  expect(screen.getByText('Probá desde Chrome, Edge, Firefox o Safari en una compu.')).toBeInTheDocument();
  await settle();
});

it('sin TRANSMITIR no hay botón de pantalla', async () => {
  setCall({ estado: 'CONECTADO', canal, misPermisos: ['VER', 'HABLAR'] });
  show();
  expect(screen.queryByRole('button', { name: /pantalla/ })).not.toBeInTheDocument();
  await settle();
});

it('la barra permite apagar la cámara desde otra página', () => {
  setCall({ estado: 'CONECTADO', canal: transmite, misPermisos: transmite.misPermisos, camara: true });
  showBar('/amigos');
  fireEvent.click(screen.getByRole('button', { name: 'Apagar cámara' }));
  expect(call.alternarCamara).toHaveBeenCalled();
});

it('la barra deja cortar la pantalla compartida desde otra página', () => {
  setCall({ estado: 'CONECTADO', canal: transmite, misPermisos: transmite.misPermisos, pantalla: true });
  showBar('/amigos');
  fireEvent.click(screen.getByRole('button', { name: 'Dejar de compartir' }));
  expect(call.alternarPantalla).toHaveBeenCalled();
});

it('el panel derecho del canal de texto muestra la llamada de voz y deja unirse', async () => {
  const { default: VoiceSidePanel } = await import('../components/calls/VoiceSidePanel.jsx');
  const { RightPanelContext } = await import('../components/shell/RightPanel.jsx');
  const slot = document.createElement('div');
  document.body.append(slot);
  getCallParticipants.mockResolvedValue({ items: Array.from({ length: 7 }, (_, i) => ({ usuario: usuario(i + 1, `P${i + 1}`) })) });
  render(<MemoryRouter><RightPanelContext.Provider value={slot}><VoiceSidePanel canales={[canal]} base="/comunidades/4/canales" /></RightPanelContext.Provider></MemoryRouter>);
  const panel = within(slot);
  expect(await panel.findByText('P5')).toBeInTheDocument();
  expect(panel.queryByText('P6')).not.toBeInTheDocument();
  fireEvent.click(panel.getByRole('button', { name: /2 más/ }));
  expect(panel.getByText('P7')).toBeInTheDocument();
  expect(panel.getByRole('link', { name: 'charla' })).toHaveAttribute('href', '/comunidades/4/canales/2');
  fireEvent.click(panel.getByRole('button', { name: 'Unirme a la llamada' }));
  expect(call.entrar).toHaveBeenCalledWith(canal);
  slot.remove();
});

function SceneMarker(){useCallScene('/comunidades/4/canales/2',true);return null;}
it('abrir ajustes recupera la barra aunque la URL del canal no cambie',()=>{
 setCall({estado:'CONECTADO',canal,misPermisos:['VER']});
 const {rerender}=render(<MemoryRouter initialEntries={['/comunidades/4/canales/2']}><CallOriginProvider><ActiveCallBar/><SceneMarker/></CallOriginProvider></MemoryRouter>);
 expect(screen.queryByRole('complementary',{name:'Llamada activa'})).not.toBeInTheDocument();
 rerender(<MemoryRouter initialEntries={['/comunidades/4/canales/2']}><CallOriginProvider><ActiveCallBar/></CallOriginProvider></MemoryRouter>);
 expect(screen.getByRole('complementary',{name:'Llamada activa'})).toBeInTheDocument();
});

it('una respuesta inicial anterior a un ingreso no borra al participante anunciado',async()=>{
 let resolve;getCallParticipants.mockReturnValueOnce(new Promise(r=>{resolve=r;}));show();await settle();
 emit('call:participant-joined',{idCanal:2,participante:{usuario:usuario(7,'Ana')}});
 await act(async()=>resolve({items:[]}));expect(screen.getByText('Hay 1 persona conectada.')).toBeInTheDocument();
});
it('el listado de quienes están en llamada se recupera periódicamente aunque falte un evento',async()=>{
 vi.useFakeTimers();try{show();await settle();getCallParticipants.mockResolvedValue({items:[{usuario:usuario(7,'Ana')}]});await act(async()=>vi.advanceTimersByTime(5000));expect(screen.getByText('Hay 1 persona conectada.')).toBeInTheDocument();}finally{vi.useRealTimers();}
});
