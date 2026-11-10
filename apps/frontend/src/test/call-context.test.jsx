import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { CallProvider } from '../context/CallContext.jsx';
import { useCall } from '../hooks/useCall.js';
import { ApiError } from '../services/api.js';
import { joinCall, leaveCall } from '../services/callsService.js';

const sdk = vi.hoisted(() => {
  const rooms = [];
  class FakeRoom {
    constructor() {
      this.handlers = new Map();
      this.remoteParticipants = new Map();
      this.canPlaybackAudio = true;
      this.micError = null;
      this.localParticipant = {
        identity: 'usuario-1', name: 'Fabri', isLocal: true, isMicrophoneEnabled: false, isSpeaking: false,
        setMicrophoneEnabled: vi.fn(async (activo) => {
          if (sdk.micError) throw sdk.micError;
          this.localParticipant.isMicrophoneEnabled = activo;
        }),
      };
      this.connect = vi.fn(async () => {
        this.eventosAlConectar = [...this.handlers.keys()];
        if (sdk.connectError) throw sdk.connectError;
      });
      this.disconnect = vi.fn(async () => { this.localParticipant.isMicrophoneEnabled = false; });
      this.startAudio = vi.fn(async () => {});
      rooms.push(this);
    }
    on(evento, fn) {
      if (!this.handlers.has(evento)) this.handlers.set(evento, new Set());
      this.handlers.get(evento).add(fn);
      return this;
    }
    removeAllListeners() { this.handlers.clear(); }
    emit(evento, ...args) { this.handlers.get(evento)?.forEach((fn) => fn(...args)); }
  }
  const nombres = new Proxy({}, { get: (_, clave) => clave });
  return { rooms, FakeRoom, nombres, micError: null, connectError: null };
});

vi.mock('livekit-client', () => ({
  Room: sdk.FakeRoom,
  RoomEvent: sdk.nombres,
  DisconnectReason: sdk.nombres,
  Track: { Kind: { Audio: 'audio', Video: 'video' } },
}));
vi.mock('../services/callsService.js', () => ({ joinCall: vi.fn(), leaveCall: vi.fn() }));

const voz = { id: 2, nombre: 'charla', tipo: 'VOZ' };
const otro = { id: 3, nombre: 'reunión', tipo: 'VOZ' };
const llamada = (misPermisos = ['VER', 'HABLAR']) => ({ llamada: { url: 'wss://lk.test', token: 'tok', sala: 'canal-2', expiraEn: 600, misPermisos } });
const ultimaRoom = () => sdk.rooms.at(-1);

function Panel() {
  const call = useCall();
  return <div>
    <p data-testid="estado">{call.estado}</p>
    <p data-testid="error">{call.error?.message ?? ''}</p>
    <p data-testid="microfono">{call.microfono ? 'abierto' : 'cerrado'}</p>
    <p data-testid="participantes">{call.participantes.map((p) => `${p.nombre}${p.hablando ? '*' : ''}`).join(',')}</p>
    <button onClick={() => call.entrar(voz)}>Unirse</button>
    <button onClick={() => call.entrar(otro)}>Unirse a otro</button>
    <button onClick={() => call.entrar(voz, { reemplazar: true })}>Salir de la otra y unirse</button>
    <button onClick={call.salir}>Salir</button>
    <button onClick={call.alternarMicrofono}>Micrófono</button>
  </div>;
}

const estado = () => screen.getByTestId('estado').textContent;
const error = () => screen.getByTestId('error').textContent;

function show() {
  return render(<CallProvider><Panel /></CallProvider>);
}
async function conectado() {
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Unirse' }));
  await waitFor(() => expect(estado()).toBe('CONECTADO'));
}

beforeEach(() => {
  sdk.rooms.length = 0;
  sdk.micError = null;
  sdk.connectError = null;
  joinCall.mockReset().mockResolvedValue(llamada());
  leaveCall.mockReset().mockResolvedValue(null);
});

it('arranca desconectado y entrar no pide el micrófono', async () => {
  show();
  expect(estado()).toBe('DESCONECTADO');
  fireEvent.click(screen.getByRole('button', { name: 'Unirse' }));
  expect(estado()).toBe('CONECTANDO');
  await waitFor(() => expect(estado()).toBe('CONECTADO'));
  expect(joinCall).toHaveBeenCalledWith(2);
  expect(ultimaRoom().connect).toHaveBeenCalledWith('wss://lk.test', 'tok');
  expect(ultimaRoom().localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();
  expect(screen.getByTestId('microfono').textContent).toBe('cerrado');
});

it('registra los listeners antes de conectarse', async () => {
  await conectado();
  expect(ultimaRoom().eventosAlConectar).toEqual(expect.arrayContaining(['ParticipantConnected', 'TrackSubscribed', 'Disconnected']));
});

it('un doble clic no abre dos conexiones', async () => {
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Unirse' }));
  fireEvent.click(screen.getByRole('button', { name: 'Unirse' }));
  await waitFor(() => expect(estado()).toBe('CONECTADO'));
  expect(joinCall).toHaveBeenCalledTimes(1);
  expect(sdk.rooms).toHaveLength(1);
});

it('activa y silencia el micrófono solo con una acción explícita', async () => {
  await conectado();
  fireEvent.click(screen.getByRole('button', { name: 'Micrófono' }));
  await waitFor(() => expect(screen.getByTestId('microfono').textContent).toBe('abierto'));
  fireEvent.click(screen.getByRole('button', { name: 'Micrófono' }));
  await waitFor(() => expect(screen.getByTestId('microfono').textContent).toBe('cerrado'));
  expect(ultimaRoom().localParticipant.setMicrophoneEnabled.mock.calls).toEqual([[true], [false]]);
});

it('un usuario de solo recepción participa sin que se le pida micrófono', async () => {
  joinCall.mockResolvedValue(llamada(['VER']));
  await conectado();
  fireEvent.click(screen.getByRole('button', { name: 'Micrófono' }));
  await act(async () => {});
  expect(ultimaRoom().localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();
  expect(estado()).toBe('CONECTADO');
});

it.each([
  ['NotAllowedError', 'El navegador no dio permiso para usar el micrófono.'],
  ['NotFoundError', 'No se encontró ningún micrófono.'],
  ['NotReadableError', 'El micrófono está ocupado por otra aplicación.'],
])('un fallo de micrófono (%s) no corta la llamada', async (name, mensaje) => {
  await conectado();
  sdk.micError = Object.assign(new Error('x'), { name });
  fireEvent.click(screen.getByRole('button', { name: 'Micrófono' }));
  await waitFor(() => expect(error()).toBe(mensaje));
  expect(estado()).toBe('CONECTADO');
  expect(ultimaRoom().disconnect).not.toHaveBeenCalled();
});

it('MEDIA_UNAVAILABLE deja un error recuperable', async () => {
  joinCall.mockRejectedValueOnce(new ApiError(503, { code: 'MEDIA_UNAVAILABLE', message: 'Las llamadas no estan disponibles en este momento' }));
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Unirse' }));
  await waitFor(() => expect(estado()).toBe('ERROR'));
  expect(error()).toBe('Las llamadas no estan disponibles en este momento');
  expect(sdk.rooms).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Unirse' }));
  await waitFor(() => expect(estado()).toBe('CONECTADO'));
});

it('ALREADY_IN_CALL permite salir de la otra llamada y entrar', async () => {
  joinCall.mockRejectedValueOnce(new ApiError(409, { code: 'ALREADY_IN_CALL', message: 'Ya estas en otra llamada', details: [{ idCanal: 9 }] }));
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Unirse' }));
  await waitFor(() => expect(estado()).toBe('ERROR'));
  joinCall.mockRejectedValueOnce(new ApiError(409, { code: 'ALREADY_IN_CALL', message: 'Ya estas en otra llamada', details: [{ idCanal: 9 }] }));
  fireEvent.click(screen.getByRole('button', { name: 'Salir de la otra y unirse' }));
  await waitFor(() => expect(estado()).toBe('CONECTADO'));
  expect(leaveCall).toHaveBeenCalledWith(9);
});

it('si falla la conexión a LiveKit avisa al back y queda en error', async () => {
  sdk.connectError = new Error('ws');
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Unirse' }));
  await waitFor(() => expect(estado()).toBe('ERROR'));
  expect(error()).toBe('No se pudo conectar con el servidor de llamadas.');
  expect(leaveCall).toHaveBeenCalledWith(2);
});

it('salir libera la conexión, el audio remoto y avisa al back', async () => {
  await conectado();
  const room = ultimaRoom();
  const audio = document.createElement('audio');
  act(() => room.emit('TrackSubscribed', { kind: 'audio', attach: () => audio, detach: () => [audio] }));
  expect(document.body.contains(audio)).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Salir' }));
  await waitFor(() => expect(estado()).toBe('DESCONECTADO'));
  expect(room.disconnect).toHaveBeenCalled();
  expect(leaveCall).toHaveBeenCalledWith(2);
  expect(document.body.contains(audio)).toBe(false);
  expect(room.handlers.size).toBe(0);
});

it('cambiar de canal sale del anterior antes de entrar al nuevo', async () => {
  await conectado();
  const primera = ultimaRoom();
  fireEvent.click(screen.getByRole('button', { name: 'Unirse a otro' }));
  await waitFor(() => expect(joinCall).toHaveBeenLastCalledWith(3));
  await waitFor(() => expect(estado()).toBe('CONECTADO'));
  expect(primera.disconnect).toHaveBeenCalled();
  expect(leaveCall).toHaveBeenCalledWith(2);
  expect(sdk.rooms).toHaveLength(2);
});

it('muestra participantes y quién habla según LiveKit', async () => {
  await conectado();
  const room = ultimaRoom();
  const ana = { identity: 'usuario-7', name: 'Ana', isMicrophoneEnabled: true, isSpeaking: false };
  room.remoteParticipants.set('usuario-7', ana);
  act(() => room.emit('ParticipantConnected', ana));
  expect(screen.getByTestId('participantes').textContent).toBe('Fabri,Ana');
  ana.isSpeaking = true;
  act(() => room.emit('ActiveSpeakersChanged', [ana]));
  expect(screen.getByTestId('participantes').textContent).toBe('Fabri,Ana*');
});

it('refleja la reconexión interna del SDK', async () => {
  await conectado();
  act(() => ultimaRoom().emit('Reconnecting'));
  expect(estado()).toBe('RECONECTANDO');
  act(() => ultimaRoom().emit('Reconnected'));
  expect(estado()).toBe('CONECTADO');
});

it('ante un corte pide un token nuevo antes de reconectar', async () => {
  await conectado();
  joinCall.mockResolvedValue({ llamada: { ...llamada().llamada, token: 'nuevo' } });
  act(() => { ultimaRoom().emit('Disconnected', 'SIGNAL_CLOSE'); });
  expect(estado()).toBe('RECONECTANDO');
  await waitFor(() => expect(estado()).toBe('CONECTADO'));
  expect(joinCall).toHaveBeenCalledTimes(2);
  expect(sdk.rooms).toHaveLength(2);
  expect(ultimaRoom().connect).toHaveBeenCalledWith('wss://lk.test', 'nuevo');
});

it('si lo sacan de la sala no reconecta ni avisa salida al back', async () => {
  await conectado();
  act(() => { ultimaRoom().emit('Disconnected', 'PARTICIPANT_REMOVED'); });
  await waitFor(() => expect(estado()).toBe('ERROR'));
  expect(error()).toBe('Saliste de la llamada desde otro lugar o perdiste el acceso al canal.');
  expect(joinCall).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Salir' }));
  await waitFor(() => expect(estado()).toBe('DESCONECTADO'));
  expect(leaveCall).not.toHaveBeenCalled();
});

it('salir mientras conecta no deja una conexión colgada', async () => {
  let responder;
  joinCall.mockImplementationOnce(() => new Promise((resolve) => { responder = resolve; }));
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Unirse' }));
  fireEvent.click(screen.getByRole('button', { name: 'Salir' }));
  await waitFor(() => expect(estado()).toBe('DESCONECTADO'));
  await act(async () => responder(llamada()));
  expect(sdk.rooms).toHaveLength(0);
  expect(estado()).toBe('DESCONECTADO');
});

it('navegar dentro de la app conserva una sola conexión', async () => {
  render(<MemoryRouter initialEntries={['/canal']}><CallProvider><Routes>
    <Route path="/canal" element={<><Panel /><Link to="/amigos">Amigos</Link></>} />
    <Route path="/amigos" element={<Link to="/canal">Volver</Link>} />
  </Routes></CallProvider></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Unirse' }));
  await waitFor(() => expect(estado()).toBe('CONECTADO'));
  fireEvent.click(screen.getByRole('link', { name: 'Amigos' }));
  fireEvent.click(await screen.findByRole('link', { name: 'Volver' }));
  await waitFor(() => expect(estado()).toBe('CONECTADO'));
  expect(sdk.rooms).toHaveLength(1);
  expect(ultimaRoom().disconnect).not.toHaveBeenCalled();
  expect(joinCall).toHaveBeenCalledTimes(1);
});

it('desmontar el provider (logout) cierra la llamada', async () => {
  const { unmount } = show();
  fireEvent.click(screen.getByRole('button', { name: 'Unirse' }));
  await waitFor(() => expect(estado()).toBe('CONECTADO'));
  const room = ultimaRoom();
  unmount();
  expect(room.disconnect).toHaveBeenCalled();
  expect(leaveCall).toHaveBeenCalledWith(2);
});
