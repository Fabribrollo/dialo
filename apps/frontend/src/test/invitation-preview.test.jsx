import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { Link, MemoryRouter, Route, Routes, useParams } from 'react-router';
import CommunitiesLayout, { useCommunities } from '../context/CommunitiesContext.jsx';
import InvitationPage from '../pages/InvitationPage.jsx';
import * as service from '../services/invitationsService.js';
import { getCommunities } from '../services/communitiesService.js';
import { useSocket } from '../hooks/useSocket.js';
import { pendingInvitation, rememberInvitation } from '../utils-invitations.js';

vi.mock('../hooks/useSocket.js', () => ({ useSocket: vi.fn() }));
vi.mock('../services/communitiesService.js', () => ({ getCommunities: vi.fn() }));
vi.mock('../services/invitationsService.js', () => ({ previewInvitation: vi.fn(), acceptInvitation: vi.fn() }));
const preview = { id: 4, nombre: 'Club', tipo: 'PRIVADA', imagenUrl: null, cantidadIntegrantes: 2, esIntegrante: false };
const community = { ...preview, miRol: 'INTEGRANTE' };
let listeners;
function fire(event, data) { act(() => listeners.get(event)?.forEach((fn) => fn(data))); }
function Destination() { const { items } = useCommunities(); return <><h1>Comunidad {useParams().id}</h1><span>Listado: {items.length}</span></>; }
function show(path = '/invitacion/valida') {
  return render(<MemoryRouter initialEntries={[path]}><Link to="/invitacion/segunda">Otra invitación</Link><Routes>
    <Route element={<CommunitiesLayout />}>
      <Route path="/invitacion/:codigo" element={<InvitationPage />} />
      <Route path="/comunidades/:id" element={<Destination />} />
      <Route path="/comunidades" element={<h1>Mis comunidades</h1>} />
    </Route>
  </Routes></MemoryRouter>);
}
beforeEach(() => {
  sessionStorage.clear();
  service.previewInvitation.mockReset().mockResolvedValue({ comunidad: preview });
  service.acceptInvitation.mockReset().mockResolvedValue({ comunidad: community });
  getCommunities.mockReset().mockResolvedValue({ items: [] });
  listeners = new Map();
  useSocket.mockReturnValue({
    on: (name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    off: (name, fn) => listeners.get(name)?.delete(fn),
  });
});
it('consultar la vista previa identifica la comunidad sin ingresar y limpia el destino pendiente', async () => {
  rememberInvitation('/invitacion/valida');
  show();
  await screen.findByRole('heading', { name: 'Club' });
  expect(service.acceptInvitation).not.toHaveBeenCalled();
  expect(pendingInvitation()).toBeNull();
});
it('rechazar vuelve al listado sin crear una membresía', async () => {
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Rechazar' }));
  await screen.findByRole('heading', { name: 'Mis comunidades' });
  expect(service.acceptInvitation).not.toHaveBeenCalled();
});
it('aceptar incorpora la comunidad sin duplicar el evento y abre su detalle', async () => {
  let resolve;
  service.acceptInvitation.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Aceptar invitación' }));
  expect(screen.getByRole('button', { name: 'Ingresando…' })).toBeDisabled();
  fire('community:new', { comunidad: community });
  await act(async () => resolve({ comunidad: community }));
  await screen.findByRole('heading', { name: 'Comunidad 4' });
  expect(screen.getByText('Listado: 1')).toBeInTheDocument();
  expect(service.acceptInvitation).toHaveBeenCalledExactlyOnceWith('valida');
});
it.each([
  ['INVITATION_NOT_FOUND', 404, /no existe/],
  ['INVITATION_REVOKED', 410, /revocada/],
  ['INVITATION_EXPIRED', 410, /venció/],
  ['INVITATION_EXHAUSTED', 410, /máximo de usos/],
])('presenta %s sin ofrecer ingreso', async (code, status, message) => {
  service.previewInvitation.mockRejectedValue({ code, status });
  show();
  expect(await screen.findByRole('alert')).toHaveTextContent(message);
  expect(screen.queryByRole('button', { name: 'Aceptar invitación' })).not.toBeInTheDocument();
});
it('una revocación entre la vista previa y la aceptación se comunica sin confirmar ingreso', async () => {
  service.acceptInvitation.mockRejectedValue({ code: 'INVITATION_REVOKED', status: 410 });
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Aceptar invitación' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('revocada');
  expect(screen.queryByRole('heading', { name: 'Comunidad 4' })).not.toBeInTheDocument();
});
it('un integrante existente abre el espacio sin consumir otra invitación', async () => {
  service.previewInvitation.mockResolvedValue({ comunidad: { ...preview, esIntegrante: true } });
  show();
  fireEvent.click(await screen.findByRole('link', { name: 'Abrir comunidad' }));
  await screen.findByRole('heading', { name: 'Comunidad 4' });
  expect(service.acceptInvitation).not.toHaveBeenCalled();
});
it('una falla de red permite reintentar la consulta', async () => {
  service.previewInvitation.mockRejectedValueOnce({ status: 0, message: 'Sin conexión' });
  show();
  expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión');
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await screen.findByRole('button', { name: 'Aceptar invitación' });
});
it('una falla de aceptación conserva la vista previa y permite reintentar', async () => {
  service.acceptInvitation.mockRejectedValueOnce({ status: 0, message: 'Sin conexión' });
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Aceptar invitación' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión');
  fireEvent.click(screen.getByRole('button', { name: 'Aceptar invitación' }));
  await screen.findByRole('heading', { name: 'Comunidad 4' });
});
it('si se pierde la respuesta HTTP, un evento autenticado de ingreso evita volver a aceptar', async () => {
  let reject;
  service.acceptInvitation.mockReturnValueOnce(new Promise((_, r) => { reject = r; }));
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Aceptar invitación' }));
  fire('community:new', { comunidad: community });
  await act(async () => reject({ status: 0, message: 'Respuesta perdida' }));
  await screen.findByRole('heading', { name: 'Comunidad 4' });
  expect(service.acceptInvitation).toHaveBeenCalledTimes(1);
});
it('cambiar de código descarta la respuesta anterior', async () => {
  let first;
  service.previewInvitation.mockImplementation((codigo) => codigo === 'valida' ? new Promise((r) => { first = r; }) : Promise.resolve({ comunidad: { ...preview, id: 5, nombre: 'Segunda' } }));
  show();
  fireEvent.click(screen.getByRole('link', { name: 'Otra invitación' }));
  await screen.findByRole('heading', { name: 'Segunda' });
  await act(async () => first({ comunidad: preview }));
  expect(screen.queryByRole('heading', { name: 'Club' })).not.toBeInTheDocument();
});
it('un código inválido no consulta la API', () => {
  show('/invitacion/codigo-demasiado-largo');
  expect(screen.getByRole('alert')).toHaveTextContent('inválido');
  expect(service.previewInvitation).not.toHaveBeenCalled();
});
it('foco y reconexión vuelven a verificar la invitación y se limpian los listeners', async () => {
  const { unmount } = show();
  await screen.findByRole('heading', { name: 'Club' });
  service.previewInvitation.mockRejectedValue({ code: 'INVITATION_REVOKED', status: 410 });
  fireEvent(window, new Event('focus'));
  expect(await screen.findByRole('alert')).toHaveTextContent('revocada');
  fire('connect');
  await waitFor(() => expect(service.previewInvitation).toHaveBeenCalledTimes(3));
  unmount();
  expect([...listeners.values()].every((handlers) => handlers.size === 0)).toBe(true);
});
