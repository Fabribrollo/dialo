import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import CallPanel from '../components/calls/CallPanel.jsx';
import ActiveCallBar from '../components/calls/ActiveCallBar.jsx';
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
    estado: 'DESCONECTADO', canal: null, error: null, misPermisos: [], participantes: [], microfono: false, audioBloqueado: false,
    entrar: vi.fn(), salir: vi.fn(), alternarMicrofono: vi.fn(), activarAudio: vi.fn(), ...extra,
  };
}
function setCall(extra) { call = base(extra); useCall.mockReturnValue(call); }
function show(c = canal) { return render(<CallPanel canal={c} />); }
const lista = () => within(screen.getByRole('list'));

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

it('fuera de la llamada ofrece unirse y no muestra el micrófono', async () => {
  show();
  expect(screen.getByText('No estás en esta llamada.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /micrófono/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Unirse a la llamada' }));
  expect(call.entrar).toHaveBeenCalledWith(canal);
  expect(await screen.findByText('Todavía no hay nadie conectado.')).toBeInTheDocument();
});

it('lista quién está conectado sin entrar y se actualiza por socket', async () => {
  getCallParticipants.mockResolvedValue({ items: [{ usuario: usuario(7, 'Ana'), desde: '2026-11-10T00:00:00Z' }] });
  const { unmount } = show();
  expect(await screen.findByText('Ana')).toBeInTheDocument();
  expect(channelSubscription).toHaveBeenCalledWith(expect.anything(), 'channel:subscribe', 2);
  emit('call:participant-joined', { idCanal: 2, participante: { usuario: usuario(8, 'Beto') } });
  emit('call:participant-joined', { idCanal: 9, participante: { usuario: usuario(10, 'Otro') } });
  expect(lista().getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Ana', 'Beto']);
  emit('call:participant-left', { idCanal: 2, idUsuario: 7 });
  expect(lista().getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Beto']);
  expect(screen.getByRole('heading', { name: 'En la llamada (1)' })).toBeInTheDocument();
  unmount();
  expect(channelSubscription).toHaveBeenCalledWith(expect.anything(), 'channel:unsubscribe', 2);
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
  const items = lista().getAllByRole('listitem');
  expect(items.map((li) => li.textContent)).toEqual(['AnaHablando', 'Beto', 'CaroSilenciado']);
  expect(items[0]).toHaveClass('is-speaking');
  expect(items[1]).not.toHaveClass('is-speaking');
});

it('suma participantes de LiveKit que el back todavía no confirmó', async () => {
  setCall({ estado: 'CONECTADO', canal, misPermisos: ['VER', 'HABLAR'], participantes: [{ idUsuario: 1, nombre: 'Fabri', local: true, microfono: false, hablando: false }] });
  show();
  expect(await screen.findByText('Fabri')).toBeInTheDocument();
});

it('en llamada con HABLAR muestra micrófono y salida', async () => {
  setCall({ estado: 'CONECTADO', canal, misPermisos: ['VER', 'HABLAR'] });
  show();
  expect(screen.getByRole('status')).toHaveTextContent('Estás en la llamada.');
  fireEvent.click(screen.getByRole('button', { name: 'Activar micrófono' }));
  expect(call.alternarMicrofono).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Salir de la llamada' }));
  expect(call.salir).toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Unirse a la llamada' })).not.toBeInTheDocument();
  await screen.findByText('Todavía no hay nadie conectado.');
});

it('solo recepción: puede unirse pero nunca ve el micrófono', async () => {
  const soloVer = { ...canal, misPermisos: ['VER'] };
  setCall({ estado: 'CONECTADO', canal: soloVer, misPermisos: ['VER'] });
  show(soloVer);
  expect(screen.getByText('Podés escuchar y ver, pero no hablar en este canal.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /micrófono/ })).not.toBeInTheDocument();
  await screen.findByText('Todavía no hay nadie conectado.');
});

it('si le sacan HABLAR durante la llamada el botón desaparece', async () => {
  setCall({ estado: 'CONECTADO', canal, misPermisos: ['VER', 'HABLAR'] });
  const { rerender } = show();
  expect(screen.getByRole('button', { name: 'Activar micrófono' })).toBeInTheDocument();
  rerender(<CallPanel canal={{ ...canal, misPermisos: ['VER'] }} />);
  expect(screen.queryByRole('button', { name: /micrófono/ })).not.toBeInTheDocument();
  await screen.findByText('Todavía no hay nadie conectado.');
});

it.each([
  ['CONECTANDO', 'Conectando a la llamada…'],
  ['RECONECTANDO', 'Se cortó la conexión. Reconectando…'],
])('diferencia el estado %s', async (estado, texto) => {
  setCall({ estado, canal, misPermisos: ['VER', 'HABLAR'] });
  show();
  expect(screen.getByRole('status')).toHaveTextContent(texto);
  expect(screen.getByRole('button', { name: 'Activar micrófono' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Unirse a la llamada' })).not.toBeInTheDocument();
  await screen.findByText('Todavía no hay nadie conectado.');
});

it('un error permite reintentar', async () => {
  setCall({ estado: 'ERROR', canal, error: { code: 'MEDIA_UNAVAILABLE', message: 'Las llamadas no estan disponibles en este momento' } });
  show();
  expect(screen.getByRole('alert')).toHaveTextContent('Las llamadas no estan disponibles en este momento');
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(call.entrar).toHaveBeenCalledWith(canal);
  await screen.findByText('Todavía no hay nadie conectado.');
});

it('ALREADY_IN_CALL ofrece salir de la otra llamada', async () => {
  setCall({ estado: 'ERROR', canal, error: { code: 'ALREADY_IN_CALL', message: 'Ya estas en otra llamada' } });
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Salir de la otra llamada y unirme' }));
  expect(call.entrar).toHaveBeenCalledWith(canal, { reemplazar: true });
  await screen.findByText('Todavía no hay nadie conectado.');
});

it('estando en otra llamada ofrece cambiar', async () => {
  setCall({ estado: 'CONECTADO', canal: { ...canal, id: 3, nombre: 'reunión' }, misPermisos: ['VER', 'HABLAR'] });
  show();
  expect(screen.getByText('Estás en la llamada de «reunión».')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /micrófono/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cambiar a esta llamada' }));
  expect(call.entrar).toHaveBeenCalledWith(canal);
  await screen.findByText('Todavía no hay nadie conectado.');
});

it('si el navegador bloquea el audio ofrece activarlo', async () => {
  setCall({ estado: 'CONECTADO', canal, misPermisos: ['VER'], audioBloqueado: true });
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Activar audio' }));
  expect(call.activarAudio).toHaveBeenCalled();
  await screen.findByText('Todavía no hay nadie conectado.');
});

function showBar(path) {
  return render(<MemoryRouter initialEntries={[path]}><ActiveCallBar /></MemoryRouter>);
}

it('la barra de llamada aparece fuera del canal con salida visible', () => {
  setCall({ estado: 'CONECTADO', canal, misPermisos: ['VER', 'HABLAR'] });
  showBar('/amigos');
  const barra = screen.getByRole('complementary', { name: 'Llamada activa' });
  expect(within(barra).getByRole('status')).toHaveTextContent('En llamada · charla');
  expect(within(barra).getByRole('link', { name: 'Volver al canal' })).toHaveAttribute('href', '/comunidades/4/canales/2');
  fireEvent.click(within(barra).getByRole('button', { name: 'Activar micrófono' }));
  fireEvent.click(within(barra).getByRole('button', { name: 'Salir de la llamada' }));
  expect(call.alternarMicrofono).toHaveBeenCalled();
  expect(call.salir).toHaveBeenCalled();
});

it('la barra no se muestra sin llamada ni dentro del propio canal', () => {
  showBar('/amigos');
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  setCall({ estado: 'CONECTADO', canal, misPermisos: ['VER'] });
  showBar('/comunidades/4/canales/2');
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
});

it('la barra muestra una llamada interrumpida y permite cerrarla', () => {
  setCall({ estado: 'ERROR', canal, error: { code: 'CALL_ENDED', message: 'La llamada terminó.' } });
  showBar('/');
  expect(screen.getByText('La llamada terminó.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
  expect(call.salir).toHaveBeenCalled();
});
