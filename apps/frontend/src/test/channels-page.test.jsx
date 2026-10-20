// Estas pruebas conservan el alcance de administración de T-24. El chat y el selector real se verifican por separado.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import CommunitiesLayout from '../context/CommunitiesContext.jsx';
import CommunityChannelsPage from '../pages/CommunityChannelsPage.jsx';
import CommunityPage from '../pages/CommunityPage.jsx';
import CommunitiesPage from '../pages/CommunitiesPage.jsx';
import * as communities from '../services/communitiesService.js';
import * as channels from '../services/channelsService.js';
import { useSocket } from '../hooks/useSocket.js';

vi.mock('../components/communities/CommunityDashboard.jsx', async () => { const { Link } = await import('react-router'); return { default: ({ comunidad }) => <><Link to={`/comunidades/${comunidad.id}/canales`}>Ver canales</Link><Link to={`/comunidades/${comunidad.id}/integrantes`}>Ver integrantes</Link></> }; });
vi.mock('../components/channel-chat/ChannelChat.jsx', () => ({ default: () => null }));
vi.mock('../components/channels/ChannelSelector.jsx', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../hooks/useSocket.js', () => ({ useSocket: vi.fn() }));
vi.mock('../hooks/useAuth.js', () => ({ useAuth: () => ({ usuario: { id: 1 } }) }));
vi.mock('../services/communitiesService.js', () => ({ getCommunity: vi.fn(), getCommunities: vi.fn(), getCommunityMembers: vi.fn(), deleteCommunity: vi.fn(), leaveCommunity: vi.fn() }));
vi.mock('../services/channelsService.js', () => ({ getChannels: vi.fn(), createChannel: vi.fn(), updateChannel: vi.fn(), deleteChannel: vi.fn(), orderChannels: vi.fn(), getChannelAccess: vi.fn(), replaceChannelAccess: vi.fn() }));
const community = { id: 4, nombre: 'Club', tipo: 'PRIVADA', miRol: 'PROPIETARIO', cantidadIntegrantes: 2, fechaCreacion: '2026-10-19T12:00:00Z' };
const text = { id: 1, idComunidad: 4, nombre: 'general', tipo: 'TEXTO', privado: false, posicion: 0, misPermisos: ['VER', 'ESCRIBIR'] };
const voice = { ...text, id: 2, nombre: 'charla', tipo: 'VOZ', posicion: 1, misPermisos: ['VER', 'HABLAR'] };
const video = { ...text, id: 3, nombre: 'reunión', tipo: 'VIDEO', privado: true, posicion: 2, misPermisos: ['VER', 'HABLAR', 'TRANSMITIR'] };
const member = { usuario: { id: 7, nombreVisible: 'Feli', nombreUsuario: 'feli' }, rol: 'INTEGRANTE' };
let items, listeners;
const fail = (status, code, message = code) => Object.assign(new Error(message), { status, code });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function emit(event, data) { act(() => listeners.get(event)?.forEach((fn) => fn(data))); }
function show(path = '/comunidades/4/canales/1') {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/comunidades" element={<CommunitiesLayout />}>
    <Route index element={<CommunitiesPage />} /><Route path=":id" element={<CommunityPage />} />
    <Route path=":id/canales/:canalId?" element={<CommunityChannelsPage />} />
  </Route></Routes></MemoryRouter>);
}
const panel = () => screen.getByRole('region', { name: 'Detalle del canal' });
async function openAccess() { fireEvent.click(await screen.findByRole('button', { name: 'Permisos' })); return screen.findByRole('button', { name: 'Guardar permisos' }); }
beforeEach(() => {
  Object.values(communities).forEach((fn) => fn.mockReset()); Object.values(channels).forEach((fn) => fn.mockReset());
  communities.getCommunity.mockResolvedValue({ comunidad: community }); communities.getCommunities.mockResolvedValue({ items: [community] });
  communities.getCommunityMembers.mockResolvedValue({ items: [member] });
  items = [text, voice, video];
  channels.getChannels.mockImplementation(async () => ({ items: [...items] }));
  channels.createChannel.mockImplementation(async (_id, data) => { const canal = { ...text, ...data, id: 8, posicion: 3 }; items = [...items, canal]; return { canal }; });
  channels.updateChannel.mockImplementation(async (id, data) => { items = items.map((c) => c.id === id ? { ...c, ...data } : c); return { canal: items.find((c) => c.id === id) }; });
  channels.deleteChannel.mockImplementation(async (id) => { items = items.filter((c) => c.id !== id); });
  channels.orderChannels.mockImplementation(async (_id, order) => { items = order.map((id, posicion) => ({ ...items.find((c) => c.id === id), posicion })); });
  channels.getChannelAccess.mockResolvedValue({ acceso: { privado: true, habilitaciones: [{ rol: 'INTEGRANTE', permisos: ['VER'] }] } });
  channels.replaceChannelAccess.mockResolvedValue({ acceso: {} });
  listeners = new Map();
  useSocket.mockReturnValue({ on: (name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); }, off: (name, fn) => listeners.get(name)?.delete(fn) });
});

it('integra navegación desde la comunidad y lista tipos en orden', async () => {
  items = [video, text, voice]; show('/comunidades/4');
  fireEvent.click(await screen.findByRole('link', { name: 'Ver canales' }));
  const nav = await screen.findByRole('navigation', { name: 'Canales de la comunidad' });
  await within(nav).findByRole('link', { name: /Texto general/ });
  expect(within(nav).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/comunidades/4/canales/1', '/comunidades/4/canales/2', '/comunidades/4/canales/3']);
});
it.each(['INTEGRANTE', 'MODERADOR'])('%s consulta canales pero no administra ni carga habilitaciones', async (miRol) => {
  communities.getCommunity.mockResolvedValue({ comunidad: { ...community, miRol } });
  items = [{ ...text, misPermisos: ['VER'] }]; show();
  expect(await screen.findByText('Este canal es de solo lectura para tu cuenta.')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Crear canal' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Permisos' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Subir/ })).not.toBeInTheDocument();
  expect(channels.getChannelAccess).not.toHaveBeenCalled();
});
it('voz y video indican llamadas futuras sin ofrecer conexión', async () => {
  show('/comunidades/4/canales/2');
  expect(await screen.findByText('Las llamadas estarán disponibles en una próxima entrega.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /llamar|conectar|unirse/i })).not.toBeInTheDocument();
});
it('resuelve un canal inexistente sin revelar datos', async () => {
  show('/comunidades/4/canales/999');
  expect(await screen.findByRole('heading', { name: 'Canal no disponible' })).toBeInTheDocument();
});
it('una comunidad inválida no solicita sus canales', async () => {
  show('/comunidades/no/canales'); await screen.findByRole('heading', { name: 'Comunidad inválida' });
  expect(channels.getChannels).not.toHaveBeenCalled();
});
it('muestra vacío y permite recuperarse de un error de listado', async () => {
  channels.getChannels.mockRejectedValueOnce(fail(0, 'NETWORK_ERROR', 'Sin conexión')); items = []; show('/comunidades/4/canales');
  fireEvent.click(await screen.findByRole('button', { name: 'Reintentar canales' }));
  expect(await screen.findByText('No hay canales disponibles para tu cuenta.')).toBeInTheDocument();
});
it('crea un canal privado de voz y abre el resultado sin duplicar envíos', async () => {
  const pending = deferred(); channels.createChannel.mockReturnValue(pending.promise); show('/comunidades/4/canales/nuevo');
  const name = await screen.findByLabelText('Nombre del canal'); fireEvent.change(name, { target: { value: 'audio' } });
  fireEvent.change(screen.getByLabelText('Tipo de canal'), { target: { value: 'VOZ' } }); fireEvent.click(screen.getByLabelText('Canal privado'));
  const form = name.closest('form'); fireEvent.submit(form); fireEvent.submit(form);
  expect(channels.createChannel).toHaveBeenCalledExactlyOnceWith(4, { nombre: 'audio', tipo: 'VOZ', privado: true });
  items = [...items, { ...voice, id: 8, nombre: 'audio', privado: true }];
  await act(async () => pending.resolve({ canal: items.at(-1) }));
  expect(await within(panel()).findByRole('heading', { name: 'audio' })).toBeInTheDocument();
});
it('rechaza espacios inválidos y conserva el formulario ante un error de creación', async () => {
  show('/comunidades/4/canales/nuevo'); const name = await screen.findByLabelText('Nombre del canal');
  fireEvent.change(name, { target: { value: ' mal ' } }); fireEvent.submit(name.closest('form'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Usá entre 1 y 32'); expect(channels.createChannel).not.toHaveBeenCalled();
  channels.createChannel.mockRejectedValue(fail(0, 'NETWORK_ERROR', 'Sin conexión'));
  fireEvent.change(name, { target: { value: 'nuevo' } }); fireEvent.submit(name.closest('form'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión'); expect(name).toHaveValue('nuevo');
});
it('edita nombre y tipo; explica conflicto por mensajes sin perder los cambios', async () => {
  channels.updateChannel.mockRejectedValue(fail(409, 'CHANNEL_HAS_MESSAGES')); show();
  fireEvent.click(await screen.findByRole('button', { name: 'Editar canal' }));
  fireEvent.change(screen.getByLabelText('Nombre del canal'), { target: { value: 'avisos' } });
  fireEvent.change(screen.getByLabelText('Tipo de canal'), { target: { value: 'VIDEO' } }); fireEvent.click(screen.getByRole('button', { name: 'Guardar canal' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('debe conservar el tipo Texto');
  expect(channels.updateChannel).toHaveBeenCalledWith(1, { nombre: 'avisos', tipo: 'VIDEO' });
  expect(screen.getByLabelText('Nombre del canal')).toHaveValue('avisos');
});
it('eliminar exige confirmar, cancelar devuelve el foco y confirmar retira el canal', async () => {
  show(); const button = await screen.findByRole('button', { name: 'Eliminar canal' }); fireEvent.click(button);
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' })); expect(button).toHaveFocus(); expect(channels.deleteChannel).not.toHaveBeenCalled();
  fireEvent.click(button); fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar canal' }));
  await waitFor(() => expect(channels.deleteChannel).toHaveBeenCalledExactlyOnceWith(1));
  await waitFor(() => expect(screen.queryByRole('link', { name: /Texto general/ })).not.toBeInTheDocument());
});
it('un error al eliminar mantiene la confirmación disponible', async () => {
  channels.deleteChannel.mockRejectedValue(fail(0, 'NETWORK_ERROR', 'Sin conexión')); show();
  fireEvent.click(await screen.findByRole('button', { name: 'Eliminar canal' })); fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar canal' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión'); expect(screen.getByRole('dialog')).toBeInTheDocument();
});
it('ordena con controles accesibles enviando el conjunto completo y bloquea repeticiones', async () => {
  const pending = deferred(); channels.orderChannels.mockReturnValue(pending.promise); show();
  const down = await screen.findByRole('button', { name: 'Bajar «general»' }); await waitFor(() => expect(down).toBeEnabled());
  expect(screen.getByRole('button', { name: 'Subir «general»' })).toBeDisabled();
  fireEvent.click(down); fireEvent.click(down); expect(channels.orderChannels).toHaveBeenCalledExactlyOnceWith(4, [2, 1, 3]);
  items = [{ ...voice, posicion: 0 }, { ...text, posicion: 1 }, video]; await act(async () => pending.resolve());
  await screen.findByText('Orden de canales guardado.');
  await waitFor(() => expect(within(screen.getByRole('navigation', { name: 'Canales de la comunidad' })).getAllByRole('link')[0]).toHaveTextContent('charla'));
});
it('un orden obsoleto informa el conflicto y reconsulta', async () => {
  channels.orderChannels.mockRejectedValue(fail(400, 'INVALID_ORDER')); show();
  const down = await screen.findByRole('button', { name: 'Bajar «general»' }); await waitFor(() => expect(down).toBeEnabled()); fireEvent.click(down);
  expect(await screen.findByRole('alert')).toHaveTextContent('La lista de canales cambió');
  await waitFor(() => expect(channels.getChannels.mock.calls.length).toBeGreaterThan(1));
});
it('guarda solo lectura por rol sin otorgar moderación ni exponer permisos de administrador', async () => {
  show(); const save = await openAccess(); fireEvent.click(save);
  await screen.findByText('Permisos guardados.');
  expect(channels.replaceChannelAccess).toHaveBeenCalledExactlyOnceWith(1, { privado: true, habilitaciones: [{ rol: 'INTEGRANTE', permisos: ['VER'] }] });
});
it('agrega habilitación individual, escribir incluye VER y quitarla no afecta al rol', async () => {
  show(); await openAccess();
  fireEvent.change(screen.getByLabelText('Integrante a habilitar'), { target: { value: '7' } }); fireEvent.click(screen.getByRole('button', { name: 'Agregar integrante' }));
  fireEvent.click(screen.getByLabelText('Feli (@feli): Escribir')); fireEvent.click(screen.getByRole('button', { name: 'Guardar permisos' }));
  await screen.findByText('Permisos guardados.');
  expect(channels.replaceChannelAccess).toHaveBeenCalledWith(1, { privado: true, habilitaciones: [
    { rol: 'INTEGRANTE', permisos: ['VER'] }, { idUsuario: 7, permisos: ['VER', 'ESCRIBIR'] },
  ] });
});
it('quitar una habilitación individual conserva las habilitaciones del rol', async () => {
  channels.getChannelAccess.mockResolvedValue({ acceso: { privado: true, habilitaciones: [{ rol: 'INTEGRANTE', permisos: ['VER'] }, { usuario: member.usuario, permisos: ['VER', 'ESCRIBIR'] }] } });
  show(); await openAccess(); fireEvent.click(screen.getByRole('button', { name: 'Quitar habilitación de Feli (@feli)' }));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar permisos' })); await screen.findByText('Permisos guardados.');
  expect(channels.replaceChannelAccess.mock.calls[0][1].habilitaciones).toEqual([{ rol: 'INTEGRANTE', permisos: ['VER'] }]);
});
it('voz ofrece HABLAR y TRANSMITIR y conserva permisos de otros tipos sin conceder escritura efectiva', async () => {
  channels.getChannelAccess.mockResolvedValue({ acceso: { privado: true, habilitaciones: [{ rol: 'INTEGRANTE', permisos: ['VER', 'ESCRIBIR'] }] } });
  show('/comunidades/4/canales/2'); await openAccess();
  expect(screen.queryByLabelText('Integrantes: Escribir')).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Integrantes: Transmitir cámara o pantalla')); fireEvent.click(screen.getByRole('button', { name: 'Guardar permisos' }));
  await screen.findByText('Permisos guardados.'); expect(channels.replaceChannelAccess.mock.calls[0][1].habilitaciones[0].permisos).toEqual(['VER', 'ESCRIBIR', 'TRANSMITIR']);
});
it('un fallo al guardar acceso conserva el borrador y no duplica solicitudes', async () => {
  const pending = deferred(); channels.replaceChannelAccess.mockReturnValue(pending.promise); show(); await openAccess();
  fireEvent.click(screen.getByLabelText('Integrantes: Escribir')); const form = screen.getByRole('button', { name: 'Guardar permisos' }).closest('form');
  fireEvent.submit(form); fireEvent.submit(form); expect(channels.replaceChannelAccess).toHaveBeenCalledTimes(1);
  await act(async () => pending.reject(fail(0, 'NETWORK_ERROR', 'Sin conexión')));
  expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión'); expect(screen.getByLabelText('Integrantes: Escribir')).toBeChecked();
});
it('un fallo al cargar permisos admite reintento sin enviar un reemplazo vacío', async () => {
  channels.getChannelAccess.mockRejectedValueOnce(fail(0, 'NETWORK_ERROR', 'Sin conexión')); show();
  fireEvent.click(await screen.findByRole('button', { name: 'Permisos' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión'); expect(channels.replaceChannelAccess).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar permisos' })); await screen.findByRole('button', { name: 'Guardar permisos' });
});
it('un cambio remoto invalida el borrador de acceso y exige cargar la configuración vigente', async () => {
  show(); await openAccess(); fireEvent.click(screen.getByLabelText('Integrantes: Escribir'));
  emit('channel:updated', { canal: text });
  expect(await screen.findByRole('alert')).toHaveTextContent('Recargá el formulario');
  expect(screen.getByRole('button', { name: 'Guardar permisos' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Recargar formulario' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar permisos' })).toBeEnabled());
  expect(screen.getByLabelText('Integrantes: Escribir')).not.toBeChecked();
});
it('una actualización de otro canal no invalida el formulario actual', async () => {
  show(); await openAccess(); emit('channel:updated', { canal: voice });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar permisos' })).toBeEnabled());
});
it.each(['channel:access-lost', 'channel:deleted'])('%s retira inmediatamente el canal abierto y permite navegar', async (event) => {
  show(); await screen.findByRole('button', { name: 'Permisos' }); items = [voice, video];
  emit(event, { idComunidad: 4, idCanal: 1 });
  await screen.findByText('El canal se eliminó o ya no tenés acceso.');
  expect(screen.queryByRole('link', { name: /Texto general/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: /Voz charla/ })); expect(await within(panel()).findByRole('heading', { name: 'charla' })).toBeInTheDocument();
});
it('una respuesta anterior a perder acceso no restaura el canal', async () => {
  show(); await screen.findByRole('button', { name: 'Permisos' }); const old = deferred(); const current = deferred();
  channels.getChannels.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar canales' }));
  items = [voice, video]; emit('channel:access-lost', { idComunidad: 4, idCanal: 1 });
  await act(async () => old.resolve({ items: [text, voice, video] }));
  expect(screen.queryByRole('link', { name: /Texto general/ })).not.toBeInTheDocument();
  await act(async () => current.resolve({ items }));
});
it('ignora eventos de otra comunidad y recupera canales al reconectar', async () => {
  show(); await screen.findByRole('button', { name: 'Permisos' }); const before = channels.getChannels.mock.calls.length;
  emit('channel:access-lost', { idComunidad: 99, idCanal: 1 }); expect(channels.getChannels).toHaveBeenCalledTimes(before);
  items = [text, voice]; emit('connect'); await waitFor(() => expect(screen.queryByRole('link', { name: /Video reunión/ })).not.toBeInTheDocument());
});
it('salir de la comunidad cierra la administración y vuelve al listado', async () => {
  show(); await screen.findByRole('button', { name: 'Permisos' }); communities.getCommunities.mockResolvedValue({ items: [] });
  emit('community:left', { idComunidad: 4 }); await screen.findByRole('heading', { name: 'Comunidades' });
  expect(screen.queryByRole('button', { name: 'Permisos' })).not.toBeInTheDocument();
});

it('un cambio remoto durante un envío fallido exige recargar antes de reintentar', async () => {
  const pending = deferred(); channels.replaceChannelAccess.mockReturnValue(pending.promise); show(); await openAccess();
  fireEvent.click(screen.getByRole('button', { name: 'Guardar permisos' })); emit('channel:updated', { canal: text });
  await act(async () => pending.reject(fail(0, 'NETWORK_ERROR', 'Sin conexión')));
  expect(screen.getByRole('button', { name: 'Guardar permisos' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Recargar formulario' })).toBeInTheDocument();
});
it('cancelar la edición restituye el foco al control que la abrió', async () => {
  show(); fireEvent.click(await screen.findByRole('button', { name: 'Editar canal' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.getByRole('button', { name: 'Editar canal' })).toHaveFocus();
});
it('un integrante que desaparece exige renovar los permisos antes de otro reemplazo', async () => {
  channels.replaceChannelAccess.mockRejectedValue(fail(404, 'MEMBER_NOT_FOUND')); show(); await openAccess();
  fireEvent.click(screen.getByRole('button', { name: 'Guardar permisos' }));
  await screen.findByText(/Un integrante ya no pertenece/);
  expect(screen.getByRole('button', { name: 'Guardar permisos' })).toBeDisabled();
});
it('cambiar de canal descarta la respuesta tardía de un formulario anterior', async () => {
  const pending = deferred(); channels.updateChannel.mockReturnValue(pending.promise); show();
  fireEvent.click(await screen.findByRole('button', { name: 'Editar canal' })); fireEvent.click(screen.getByRole('button', { name: 'Guardar canal' }));
  fireEvent.click(screen.getByRole('link', { name: /Voz charla/ })); await within(panel()).findByRole('heading', { name: 'charla' });
  await act(async () => pending.resolve({ canal: { ...text, nombre: 'nuevo' } }));
  expect(within(panel()).getByRole('heading', { name: 'charla' })).toBeInTheDocument();
  expect(screen.queryByText('Canal actualizado.')).not.toBeInTheDocument();
});
it('una desconexión invalida el borrador hasta actualizar la configuración', async () => {
  show(); await openAccess(); emit('disconnect');
  expect(screen.getByRole('button', { name: 'Guardar permisos' })).toBeDisabled();
});
