import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import CommunitiesLayout from '../context/CommunitiesContext.jsx';
import CommunitiesPage from '../pages/CommunitiesPage.jsx';
import CommunityPage from '../pages/CommunityPage.jsx';
import CommunityFormPage from '../pages/CommunityFormPage.jsx';
import * as service from '../services/communitiesService.js';
import { useSocket } from '../hooks/useSocket.js';

vi.mock('../components/communities/CommunityDashboard.jsx', async () => { const { Link } = await import('react-router'); return { default: ({ comunidad }) => <><Link to={`/comunidades/${comunidad.id}/canales`}>Ver canales</Link><Link to={`/comunidades/${comunidad.id}/integrantes`}>Ver integrantes</Link></> }; });
vi.mock('../hooks/useSocket.js', () => ({ useSocket: vi.fn() }));
vi.mock('../services/communitiesService.js', () => ({
  getCommunities: vi.fn(), getCommunity: vi.fn(), createCommunity: vi.fn(),
  updateCommunity: vi.fn(), uploadCommunityImage: vi.fn(), deleteCommunity: vi.fn(),
}));
const community = { id: 4, nombre: 'Club de lectura', tipo: 'PRIVADA', miRol: 'PROPIETARIO', imagenUrl: null,
  cantidadIntegrantes: 2, idPropietario: 1, fechaCreacion: '2026-10-19T12:00:00Z' };
let listeners;
function fire(event, data) { act(() => listeners.get(event)?.forEach((fn) => fn(data))); }
function show(path = '/comunidades') {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/comunidades" element={<CommunitiesLayout />}>
      <Route index element={<CommunitiesPage />} />
      <Route path="nueva" element={<CommunityFormPage />} />
      <Route path=":id" element={<CommunityPage />} />
      <Route path=":id/editar" element={<CommunityFormPage />} />
    </Route>
  </Routes></MemoryRouter>);
}
beforeEach(() => {
  Object.values(service).forEach((fn) => fn.mockReset());
  service.getCommunities.mockResolvedValue({ items: [community] });
  service.getCommunity.mockResolvedValue({ comunidad: community });
  service.createCommunity.mockResolvedValue({ comunidad: community });
  service.updateCommunity.mockResolvedValue({ comunidad: community });
  service.uploadCommunityImage.mockResolvedValue({ comunidad: { ...community, imagenUrl: '/foto.webp' } });
  service.deleteCommunity.mockResolvedValue(null);
  listeners = new Map();
  useSocket.mockReturnValue({
    on: (name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    off: (name, fn) => listeners.get(name)?.delete(fn),
  });
  URL.createObjectURL = vi.fn(() => 'blob:community-preview');
  URL.revokeObjectURL = vi.fn();
});
it('lista, abre y consulta una comunidad con su rol', async () => {
  show();
  fireEvent.click(await screen.findByRole('link', { name: /Club de lectura/ }));
  await screen.findByRole('heading', { name: 'Club de lectura' });
  expect(screen.getByText('Propietario')).toBeInTheDocument();
  expect(service.getCommunity).toHaveBeenCalledWith(4);
});
it('distingue lista vacía de error y permite recuperar el listado', async () => {
  service.getCommunities.mockRejectedValueOnce(new Error('Sin conexión')).mockResolvedValue({ items: [] });
  show();
  expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión');
  expect(screen.queryByText('No pertenecés a ninguna comunidad')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await screen.findByText('No pertenecés a ninguna comunidad');
});
it.each(['INTEGRANTE', 'MODERADOR'])('un %s no recibe controles de edición o eliminación', async (miRol) => {
  service.getCommunity.mockResolvedValue({ comunidad: { ...community, miRol } });
  show('/comunidades/4');
  await screen.findByRole('heading', { name: 'Club de lectura' });
  expect(screen.queryByRole('link', { name: 'Editar comunidad' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Eliminar comunidad' })).not.toBeInTheDocument();
});
it('un administrador puede editar y no eliminar', async () => {
  service.getCommunity.mockResolvedValue({ comunidad: { ...community, miRol: 'ADMIN' } });
  show('/comunidades/4');
  expect(await screen.findByRole('link', { name: 'Editar comunidad' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Eliminar comunidad' })).not.toBeInTheDocument();
});
it('impide editar abriendo la URL directamente sin permiso', async () => {
  service.getCommunity.mockResolvedValue({ comunidad: { ...community, miRol: 'INTEGRANTE' } });
  show('/comunidades/4/editar');
  expect(await screen.findByRole('alert')).toHaveTextContent('No tenés permiso');
  expect(screen.queryByLabelText('Nombre de la comunidad')).not.toBeInTheDocument();
});
it('cancelar la eliminación no llama a la API y restaura el foco', async () => {
  show('/comunidades/4');
  const trigger = await screen.findByRole('button', { name: 'Eliminar comunidad' });
  trigger.focus(); fireEvent.click(trigger);
  expect(screen.getByRole('dialog')).toHaveTextContent('Club de lectura');
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(service.deleteCommunity).not.toHaveBeenCalled();
  expect(trigger).toHaveFocus();
});
it('eliminar confirma, retira el espacio y vuelve al listado', async () => {
  show('/comunidades/4');
  fireEvent.click(await screen.findByRole('button', { name: 'Eliminar comunidad' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar comunidad' }).at(-1));
  await screen.findByRole('heading', { name: 'Comunidades', exact: true });
  expect(service.deleteCommunity).toHaveBeenCalledWith(4);
  expect(screen.queryByRole('link', { name: /Club de lectura/ })).not.toBeInTheDocument();
});
it('una falla de eliminación conserva el diálogo y la comunidad', async () => {
  service.deleteCommunity.mockRejectedValue(new Error('No se pudo eliminar'));
  show('/comunidades/4');
  fireEvent.click(await screen.findByRole('button', { name: 'Eliminar comunidad' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar comunidad' }).at(-1));
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo eliminar');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});
it('una eliminación en otra pestaña cierra la comunidad abierta', async () => {
  show('/comunidades/4');
  await screen.findByRole('heading', { name: 'Club de lectura' });
  service.getCommunities.mockResolvedValue({ items: [] });
  fire('community:deleted', { idComunidad: 4 });
  await screen.findByRole('heading', { name: 'Comunidades', exact: true });
  expect(screen.queryByRole('heading', { name: 'Club de lectura' })).not.toBeInTheDocument();
});
it('IDs inválidos no consultan el detalle y un 404 no expone información', async () => {
  const first = show('/comunidades/4x');
  expect(screen.getByRole('heading', { name: 'Comunidad inválida' })).toBeInTheDocument();
  expect(service.getCommunity).not.toHaveBeenCalled();
  first.unmount();
  service.getCommunity.mockRejectedValue({ status: 404, message: 'Detalle interno' });
  show('/comunidades/4');
  expect(await screen.findByRole('alert')).toHaveTextContent('La comunidad no existe o no tenés acceso.');
  expect(screen.queryByText('Detalle interno')).not.toBeInTheDocument();
});
it('crear usa datos validados, incorpora la comunidad y abre el detalle', async () => {
  show('/comunidades/nueva');
  fireEvent.change(screen.getByLabelText('Nombre de la comunidad'), { target: { value: '  Club de lectura  ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Crear comunidad' }));
  await screen.findByRole('heading', { name: 'Club de lectura' });
  expect(service.createCommunity).toHaveBeenCalledExactlyOnceWith({ nombre: 'Club de lectura', tipo: 'PRIVADA' });
});
it('un error al guardar conserva el texto y tipo elegidos', async () => {
  service.createCommunity.mockRejectedValue(new Error('Sin conexión'));
  show('/comunidades/nueva');
  fireEvent.change(screen.getByLabelText('Nombre de la comunidad'), { target: { value: 'Mi comunidad' } });
  fireEvent.change(screen.getByLabelText('Tipo de comunidad'), { target: { value: 'PUBLICA' } });
  fireEvent.click(screen.getByRole('button', { name: 'Crear comunidad' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión');
  expect(screen.getByLabelText('Nombre de la comunidad')).toHaveValue('Mi comunidad');
  expect(screen.getByLabelText('Tipo de comunidad')).toHaveValue('PUBLICA');
});
it('una actualización remota no reemplaza el borrador de edición', async () => {
  show('/comunidades/4/editar');
  const input = await screen.findByLabelText('Nombre de la comunidad');
  fireEvent.change(input, { target: { value: 'Borrador local' } });
  service.getCommunity.mockResolvedValue({ comunidad: { ...community, nombre: 'Cambio remoto' } });
  fire('community:updated', { comunidad: { ...community, nombre: 'Cambio remoto' } });
  await waitFor(() => expect(service.getCommunity).toHaveBeenCalledTimes(2));
  expect(input).toHaveValue('Borrador local');
});
it('rechaza imágenes inválidas sin intentar subirlas', async () => {
  show('/comunidades/nueva');
  fireEvent.change(screen.getByLabelText('Imagen (opcional)'), { target: { files: [new File(['test'], 'test.txt', { type: 'text/plain' })] } });
  expect(screen.getByRole('alert')).toHaveTextContent('hasta 2 MB');
  expect(service.uploadCommunityImage).not.toHaveBeenCalled();
});
it('si falla la imagen tras crear, reintentar conserva el ID y no duplica la comunidad', async () => {
  service.uploadCommunityImage.mockRejectedValueOnce(new Error('Proveedor no disponible'))
    .mockResolvedValue({ comunidad: { ...community, imagenUrl: '/foto.webp' } });
  show('/comunidades/nueva');
  fireEvent.change(screen.getByLabelText('Nombre de la comunidad'), { target: { value: 'Club de lectura' } });
  fireEvent.change(screen.getByLabelText('Imagen (opcional)'), { target: { files: [new File(['png'], 'foto.png', { type: 'image/png' })] } });
  fireEvent.click(screen.getByRole('button', { name: 'Crear comunidad' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Los datos de la comunidad se guardaron');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await screen.findByRole('heading', { name: 'Club de lectura' });
  expect(service.createCommunity).toHaveBeenCalledTimes(1);
  expect(service.updateCommunity).toHaveBeenCalledWith(4, { nombre: 'Club de lectura', tipo: 'PRIVADA' });
  expect(service.uploadCommunityImage).toHaveBeenCalledTimes(2);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:community-preview');
});
it('cargar imagen en una edición conserva el ID y usa el servicio de imagen', async () => {
  show('/comunidades/4/editar');
  const input = await screen.findByLabelText('Cambiar imagen');
  const file = new File(['png'], 'foto.png', { type: 'image/png' });
  fireEvent.change(input, { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await screen.findByRole('heading', { name: 'Club de lectura' });
  expect(service.uploadCommunityImage).toHaveBeenCalledWith(4, file);
  expect(service.createCommunity).not.toHaveBeenCalled();
});

it('impide guardados duplicados mientras la creación está pendiente', async () => {
  let resolve;
  service.createCommunity.mockReturnValue(new Promise((r) => { resolve = r; }));
  show('/comunidades/nueva');
  fireEvent.change(screen.getByLabelText('Nombre de la comunidad'), { target: { value: 'Club de lectura' } });
  const form = screen.getByRole('button', { name: 'Crear comunidad' }).closest('form');
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(service.createCommunity).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ comunidad: community }));
  await screen.findByRole('heading', { name: 'Club de lectura' });
});

it('una imagen de más de 2 MB bloquea el envío hasta quitar la selección o corregirla', () => {
  show('/comunidades/nueva');
  const file = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'grande.png', { type: 'image/png' });
  fireEvent.change(screen.getByLabelText('Imagen (opcional)'), { target: { files: [file] } });
  expect(screen.getByRole('alert')).toHaveTextContent('hasta 2 MB');
  expect(screen.getByRole('button', { name: 'Crear comunidad' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Quitar selección' }));
  expect(screen.getByRole('button', { name: 'Crear comunidad' })).toBeEnabled();
});

it('perder permisos durante una edición retira el formulario', async () => {
  show('/comunidades/4/editar');
  await screen.findByLabelText('Nombre de la comunidad');
  service.getCommunity.mockResolvedValue({ comunidad: { ...community, miRol: 'INTEGRANTE' } });
  fire('community:updated', { comunidad: community });
  expect(await screen.findByRole('alert')).toHaveTextContent('No tenés permiso');
  expect(screen.queryByLabelText('Nombre de la comunidad')).not.toBeInTheDocument();
});
