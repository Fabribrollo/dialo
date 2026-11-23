import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import CommunityForm from '../components/communities/CommunityForm.jsx';
import * as service from '../services/communitiesService.js';

const { remember, markSaved } = vi.hoisted(() => ({ remember: vi.fn(), markSaved: vi.fn() }));
vi.mock('../context/CommunitiesContext.jsx', () => ({ useCommunities: () => ({ remember, removed: new Set() }) }));
vi.mock('../context/UnsavedChangesContext.jsx', () => ({ useUnsavedChanges: () => ({ guard: fn => fn(), markSaved }) }));
vi.mock('../services/communitiesService.js', () => ({ suggestCommunity: vi.fn(), confirmCommunityDraft: vi.fn(), createCommunity: vi.fn(), updateCommunity: vi.fn(), uploadCommunityImage: vi.fn() }));
const proposal = () => ({ nombre: 'Club de estudio', tipo: 'PRIVADA', canales: [
  { nombre: 'consultas', tipo: 'TEXTO', privado: false, permisosGlobales: ['ESCRIBIR'] },
  { nombre: 'estudio', tipo: 'VOZ', privado: false, permisosGlobales: ['HABLAR'] },
], roles: [{ nombre: 'Estudiantes', permisos: ['ESCRIBIR'] }] });
const community = { id: 51, nombre: 'Club de estudio', tipo: 'PRIVADA', miRol: 'PROPIETARIO' };
function show(comunidad) {
  render(<MemoryRouter initialEntries={['/comunidades/nueva']}><Routes>
    <Route path="/comunidades/nueva" element={<CommunityForm comunidad={comunidad} />} />
    <Route path="/comunidades/:id" element={<p>Comunidad abierta</p>} />
    <Route path="/comunidades" element={<p>Listado de comunidades</p>} />
  </Routes></MemoryRouter>);
}
async function generate() {
  fireEvent.click(screen.getByRole('button', { name: 'Ayudarme con IA' }));
  fireEvent.change(screen.getByLabelText('Propósito de la comunidad'), { target: { value: 'Estudiar programación con mis compañeros' } });
  fireEvent.click(screen.getByRole('button', { name: 'Generar propuesta' }));
  await screen.findByLabelText('Nombre del canal 1');
}
beforeEach(() => {
  vi.clearAllMocks();
  service.suggestCommunity.mockResolvedValue({ propuesta: proposal() });
  service.confirmCommunityDraft.mockResolvedValue({ comunidad: community });
  service.createCommunity.mockResolvedValue({ comunidad: community });
});
it('generar no crea nada y volver a mano conserva el nombre original y el borrador IA', async () => {
  show(); fireEvent.change(screen.getByLabelText('Nombre de la comunidad'), { target: { value: 'Mi nombre manual' } });
  await generate();
  expect(screen.getByLabelText('Nombre de la comunidad')).toHaveValue('Club de estudio');
  expect(service.createCommunity).not.toHaveBeenCalled(); expect(service.confirmCommunityDraft).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Crear a mano' }));
  expect(screen.getByLabelText('Nombre de la comunidad')).toHaveValue('Mi nombre manual');
  fireEvent.click(screen.getByRole('button', { name: 'Ayudarme con IA' }));
  expect(screen.getByLabelText('Nombre del canal 1')).toHaveValue('consultas');
  expect(screen.getByLabelText('Nombre de la comunidad')).toHaveValue('Club de estudio');
});
it('edita, agrega, quita y reordena canales y roles; confirma exactamente lo revisado', async () => {
  show(); await generate();
  fireEvent.change(screen.getByLabelText('Nombre de la comunidad'), { target: { value: 'Grupo revisado' } });
  fireEvent.click(screen.getByRole('button', { name: 'Bajar canal 1' }));
  fireEvent.change(screen.getByLabelText('Nombre del canal 1'), { target: { value: 'voz-grupal' } });
  fireEvent.click(screen.getByLabelText('Privado: canal 1'));
  fireEvent.click(screen.getByRole('button', { name: 'Agregar canal' }));
  fireEvent.change(screen.getByLabelText('Nombre del canal 3'), { target: { value: 'recursos' } });
  fireEvent.click(screen.getByRole('button', { name: 'Quitar rol 1' }));
  fireEvent.click(screen.getByRole('button', { name: 'Agregar rol' }));
  fireEvent.change(screen.getByLabelText('Nombre del rol 1'), { target: { value: 'Tutores' } });
  fireEvent.click(screen.getByLabelText('Rol 1: Escribir'));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar y crear comunidad' }));
  await screen.findByText('Comunidad abierta');
  const sent = service.confirmCommunityDraft.mock.calls[0][0];
  expect(sent.clave).toMatch(/^[a-f0-9-]{36}$/);
  expect(sent.borrador.nombre).toBe('Grupo revisado');
  expect(sent.borrador.canales.map(c => c.nombre)).toEqual(['voz-grupal', 'consultas', 'recursos']);
  expect(sent.borrador.canales[0].permisosGlobales).toEqual([]);
  expect(sent.borrador.roles).toEqual([{ nombre: 'Tutores', permisos: ['ESCRIBIR'] }]);
  expect(remember).toHaveBeenCalledWith(community); expect(markSaved).toHaveBeenCalled();
});
it('cancelar y descartar no llaman a creación', async () => {
  show(); await generate(); fireEvent.click(screen.getByRole('button', { name: 'Descartar propuesta' }));
  expect(screen.queryByLabelText('Nombre del canal 1')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' })); await screen.findByText('Listado de comunidades');
  expect(service.confirmCommunityDraft).not.toHaveBeenCalled(); expect(service.createCommunity).not.toHaveBeenCalled();
});
it('un fallo de IA permite seguir a mano sin perder el formulario', async () => {
  service.suggestCommunity.mockRejectedValue(new Error('IA no disponible'));
  show(); fireEvent.change(screen.getByLabelText('Nombre de la comunidad'), { target: { value: 'Manual intacto' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ayudarme con IA' }));
  fireEvent.change(screen.getByLabelText('Propósito de la comunidad'), { target: { value: 'Estudiar programación juntos' } });
  fireEvent.click(screen.getByRole('button', { name: 'Generar propuesta' })); await screen.findByText('IA no disponible');
  fireEvent.click(screen.getByRole('button', { name: 'Crear a mano' }));
  fireEvent.click(screen.getByRole('button', { name: 'Crear comunidad' })); await screen.findByText('Comunidad abierta');
  expect(service.createCommunity).toHaveBeenCalledWith({ nombre: 'Manual intacto', tipo: 'PRIVADA' });
});
it('ignora una generación tardía después de volver a mano', async () => {
  let resolve; service.suggestCommunity.mockReturnValue(new Promise(done => { resolve = done; }));
  show(); fireEvent.change(screen.getByLabelText('Nombre de la comunidad'), { target: { value: 'Manual' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ayudarme con IA' }));
  fireEvent.change(screen.getByLabelText('Propósito de la comunidad'), { target: { value: 'Estudiar programación juntos' } });
  fireEvent.click(screen.getByRole('button', { name: 'Generar propuesta' }));
  expect(screen.getByRole('button', { name: 'Confirmar y crear comunidad' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Crear a mano' }));
  await act(async () => resolve({ propuesta: proposal() }));
  expect(screen.getByLabelText('Nombre de la comunidad')).toHaveValue('Manual');
});
it('una respuesta perdida permite reintentar el mismo envío sin editarlo ni duplicarlo', async () => {
  service.confirmCommunityDraft.mockRejectedValueOnce(Object.assign(new Error('Sin conexión'), { status: 0 })).mockResolvedValue({ comunidad: community });
  show(); await generate(); fireEvent.click(screen.getByRole('button', { name: 'Confirmar y crear comunidad' }));
  await screen.findByText('Sin conexión');
  expect(screen.getByLabelText('Nombre de la comunidad')).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar creación' })); await screen.findByText('Comunidad abierta');
  expect(service.confirmCommunityDraft.mock.calls[1][0]).toEqual(service.confirmCommunityDraft.mock.calls[0][0]);
});
it('muestra la validación del servidor y conserva el borrador para corregirlo', async () => {
  service.confirmCommunityDraft.mockRejectedValueOnce(Object.assign(new Error('Hay datos inválidos'), { status: 400, details: [{ campo: 'borrador.canales.0.nombre', message: 'No repitas nombres' }] }));
  show(); await generate(); fireEvent.click(screen.getByRole('button', { name: 'Confirmar y crear comunidad' }));
  await screen.findByText(/No repitas nombres/);
  expect(screen.getByLabelText('Nombre del canal 1')).toBeEnabled();
  expect(screen.getByLabelText('Nombre del canal 1')).toHaveValue('consultas');
});
it('el formulario de edición no ofrece generar una comunidad nueva', () => {
  show(community); expect(screen.queryByRole('button', { name: 'Ayudarme con IA' })).not.toBeInTheDocument();
});
