import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import CommunitiesLayout from '../context/CommunitiesContext.jsx';
import CommunityInvitationsPage from '../pages/CommunityInvitationsPage.jsx';
import CommunityRolesPage from '../pages/CommunityRolesPage.jsx';
import * as bans from '../services/communityBansService.js';
import * as roles from '../services/communityRolesService.js';
import CommunityMembersPage from '../pages/CommunityMembersPage.jsx';
import CommunityPage from '../pages/CommunityPage.jsx';
import CommunitiesPage from '../pages/CommunitiesPage.jsx';
import * as communities from '../services/communitiesService.js';
import * as invitations from '../services/invitationsService.js';
import { useSocket } from '../hooks/useSocket.js';
import { invitationStatus } from '../utils-invitations.js';

vi.mock('../components/communities/CommunityDashboard.jsx', async () => { const { Link } = await import('react-router'); return { default: ({ comunidad }) => <><Link to={`/comunidades/${comunidad.id}/canales`}>Ver canales</Link><Link to={`/comunidades/${comunidad.id}/integrantes`}>Ver integrantes</Link></> }; });
vi.mock('../hooks/useSocket.js', () => ({ useSocket: vi.fn() }));
vi.mock('../hooks/useAuth.js', () => ({ useAuth: () => ({ usuario: { id: 1 } }) }));
vi.mock('../services/communitiesService.js', () => ({ getCommunity: vi.fn(), getCommunities: vi.fn(), getCommunityMembers: vi.fn(), leaveCommunity: vi.fn(), deleteCommunity: vi.fn() }));
vi.mock('../services/communityBansService.js', () => ({ getCommunityBans: vi.fn(), banCommunityMember: vi.fn(), removeCommunityBan: vi.fn() }));
vi.mock('../services/communityRolesService.js', () => ({
  getCommunityRoles: vi.fn(), createCommunityRole: vi.fn(), updateCommunityRole: vi.fn(),
  deleteCommunityRole: vi.fn(), updateCommunityMemberRoles: vi.fn(),
}));
vi.mock('../services/invitationsService.js', () => ({ getInvitations: vi.fn(), createInvitation: vi.fn(), revokeInvitation: vi.fn() }));
const community = { id: 4, nombre: 'Club', tipo: 'PRIVADA', miRol: 'MODERADOR', cantidadIntegrantes: 2, fechaCreacion: '2026-10-19T12:00:00Z' };
const member = { usuario: { id: 1, nombreUsuario: 'valen', nombreVisible: 'Valen', disponibilidad: 'EN_LINEA' }, rol: 'MODERADOR', fechaIngreso: community.fechaCreacion };
const invitation = { id: 7, idComunidad: 4, codigo: 'enlace_unico', creador: member.usuario, estado: 'ACTIVA', usos: 0, usosMaximos: 5,
  fechaCreacion: community.fechaCreacion, fechaExpiracion: null };
let listeners;
function fire(event, data) { act(() => listeners.get(event)?.forEach((fn) => fn(data))); }
function show(path = '/comunidades/4/invitaciones') {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/comunidades" element={<CommunitiesLayout />}>
    <Route index element={<CommunitiesPage />} /><Route path=":id" element={<CommunityPage />} />
    <Route path=":id/roles" element={<CommunityRolesPage />} /><Route path=":id/invitaciones" element={<CommunityInvitationsPage />} /><Route path=":id/integrantes" element={<CommunityMembersPage />} />
  </Route></Routes></MemoryRouter>);
}
beforeEach(() => {
  Object.values(communities).forEach((fn) => fn.mockReset());
  Object.values(bans).forEach((fn) => fn.mockReset());
  Object.values(roles).forEach((fn) => fn.mockReset());
  roles.getCommunityRoles.mockResolvedValue({ items: [{ id: 7, nombre: 'Diseño' }, { id: 8, nombre: 'Eventos' }] });
  Object.values(invitations).forEach((fn) => fn.mockReset());
  communities.getCommunity.mockResolvedValue({ comunidad: community });
  communities.getCommunities.mockResolvedValue({ items: [community] });
  communities.getCommunityMembers.mockResolvedValue({ items: [member] });
  communities.leaveCommunity.mockResolvedValue(null);
  invitations.getInvitations.mockResolvedValue({ items: [invitation] });
  invitations.createInvitation.mockResolvedValue({ invitacion: { ...invitation, id: 8, codigo: 'nuevo_enlace' } });
  invitations.revokeInvitation.mockResolvedValue(null);
  listeners = new Map();
  useSocket.mockReturnValue({
    on: (name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    off: (name, fn) => listeners.get(name)?.delete(fn),
  });
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue() } });
});
it('un integrante no puede administrar invitaciones ni consulta sus códigos', async () => {
  communities.getCommunity.mockResolvedValue({ comunidad: { ...community, miRol: 'INTEGRANTE' } });
  show();
  expect(await screen.findByRole('alert')).toHaveTextContent('Tu rol no permite');
  expect(invitations.getInvitations).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Generar invitación' })).not.toBeInTheDocument();
});
it.each(['MODERADOR', 'ADMIN', 'PROPIETARIO'])('%s crea invitaciones con los límites elegidos', async (miRol) => {
  communities.getCommunity.mockResolvedValue({ comunidad: { ...community, miRol } });
  show();
  const button = await screen.findByRole('button', { name: 'Generar invitación' });
  fireEvent.change(screen.getByLabelText('Vencimiento'), { target: { value: '168' } });
  fireEvent.change(screen.getByLabelText('Máximo de usos (opcional)'), { target: { value: '1' } });
  fireEvent.click(button);
  await screen.findByText('Invitación creada.');
  expect(invitations.createInvitation).toHaveBeenCalledExactlyOnceWith(4, { duracionHoras: 168, usosMaximos: 1 });
  expect(screen.getAllByLabelText('Enlace de invitación')).toHaveLength(2);
});
it('crear sin límites usa null y un envío repetido no duplica la operación', async () => {
  let resolve;
  invitations.createInvitation.mockReturnValue(new Promise((r) => { resolve = r; }));
  show();
  const form = (await screen.findByRole('button', { name: 'Generar invitación' })).closest('form');
  fireEvent.change(screen.getByLabelText('Vencimiento'), { target: { value: '' } });
  fireEvent.submit(form); fireEvent.submit(form);
  expect(invitations.createInvitation).toHaveBeenCalledExactlyOnceWith(4, { duracionHoras: null, usosMaximos: null });
  await act(async () => resolve({ invitacion: invitation }));
  await screen.findByText('Invitación creada.');
});
it('un error de creación conserva los límites para reintentar', async () => {
  invitations.createInvitation.mockRejectedValue(new Error('Sin conexión'));
  show();
  await screen.findByRole('button', { name: 'Generar invitación' });
  fireEvent.change(screen.getByLabelText('Máximo de usos (opcional)'), { target: { value: '12' } });
  fireEvent.click(screen.getByRole('button', { name: 'Generar invitación' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión');
  expect(screen.getByLabelText('Máximo de usos (opcional)')).toHaveValue(12);
});
it('copia el enlace de la app actual y solo confirma cuando el portapapeles responde', async () => {
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Copiar enlace' }));
  await screen.findByText('Enlace copiado.');
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${window.location.origin}/invitacion/enlace_unico`);
});
it('si el portapapeles falla selecciona el enlace para copiarlo manualmente', async () => {
  navigator.clipboard.writeText.mockRejectedValue(new Error('Not allowed'));
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Copiar enlace' }));
  await screen.findByText(/No se pudo copiar automáticamente/);
  const input = screen.getByLabelText('Enlace de invitación');
  expect(input).toHaveFocus(); expect(input.selectionEnd).toBe(input.value.length);
  expect(screen.queryByText('Enlace copiado.')).not.toBeInTheDocument();
});
it('revocar exige confirmación y actualiza la invitación sin eliminar su registro', async () => {
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Revocar invitación' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(invitations.revokeInvitation).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Revocar invitación' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Revocar invitación' }));
  await screen.findByText('Revocada');
  expect(invitations.revokeInvitation).toHaveBeenCalledExactlyOnceWith(4, 7);
  expect(screen.getByRole('button', { name: 'Copiar enlace' })).toBeDisabled();
});
it('un fallo de revocación conserva la invitación activa y permite cancelar', async () => {
  invitations.revokeInvitation.mockRejectedValue(new Error('No se pudo revocar'));
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Revocar invitación' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Revocar invitación' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo revocar');
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.getByText('Activa')).toBeInTheDocument();
});
it('actualiza el listado al volver al foco para recuperar revocaciones de otra pestaña', async () => {
  show();
  await screen.findByText('Activa');
  invitations.getInvitations.mockResolvedValue({ items: [{ ...invitation, estado: 'REVOCADA' }] });
  fireEvent(window, new Event('focus'));
  await screen.findByText('Revocada');
});
it('presenta vencimiento y agotamiento sin permitir compartir enlaces inactivos', async () => {
  invitations.getInvitations.mockResolvedValue({ items: [{ ...invitation, estado: 'AGOTADA' }] });
  show();
  await screen.findByText('Agotada');
  expect(screen.getByRole('button', { name: 'Copiar enlace' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Revocar invitación' })).not.toBeInTheDocument();
  expect(invitationStatus({ ...invitation, fechaExpiracion: '2020-01-01T00:00:00Z' })).toBe('VENCIDA');
  expect(invitationStatus({ ...invitation, usos: 5 })).toBe('AGOTADA');
});
it('muestra integrantes y roles, identifica la cuenta propia y recupera ingresos en tiempo real', async () => {
  show('/comunidades/4/integrantes');
  await screen.findByText('Valen (vos)');
  expect(screen.getByText('Moderador')).toBeInTheDocument();
  communities.getCommunityMembers.mockResolvedValue({ items: [member, { ...member, usuario: { ...member.usuario, id: 2, nombreVisible: 'Feli', nombreUsuario: 'feli' }, rol: 'INTEGRANTE' }] });
  fire('community:member-joined', { idComunidad: 4 });
  await screen.findByText('Feli');
  expect(screen.getByText('Integrante')).toBeInTheDocument();
  communities.getCommunityMembers.mockResolvedValue({ items: [member] });
  fire('community:member-left', { idComunidad: 4, idUsuario: 2 });
  await waitFor(() => expect(screen.queryByText('Feli')).not.toBeInTheDocument());
});
it('reconectar recupera integrantes y al salir limpia los listeners', async () => {
  const { unmount } = show('/comunidades/4/integrantes');
  await screen.findByText('Valen (vos)');
  fire('connect');
  await waitFor(() => expect(communities.getCommunityMembers).toHaveBeenCalledTimes(2));
  unmount();
  expect([...listeners.values()].every((handlers) => handlers.size === 0)).toBe(true);
});
it('cancelar el abandono conserva la membresía y devuelve el foco', async () => {
  show('/comunidades/4');
  const trigger = await screen.findByRole('button', { name: 'Abandonar comunidad' });
  trigger.focus(); fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(communities.leaveCommunity).not.toHaveBeenCalled(); expect(trigger).toHaveFocus();
});
it('abandonar confirmado retira la comunidad y vuelve al listado', async () => {
  show('/comunidades/4');
  fireEvent.click(await screen.findByRole('button', { name: 'Abandonar comunidad' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Abandonar comunidad' }));
  await screen.findByRole('heading', { name: 'Comunidades', exact: true });
  expect(communities.leaveCommunity).toHaveBeenCalledExactlyOnceWith(4);
  expect(screen.queryByRole('link', { name: /Club/ })).not.toBeInTheDocument();
});
it('el propietario no recibe una acción para abandonar', async () => {
  communities.getCommunity.mockResolvedValue({ comunidad: { ...community, miRol: 'PROPIETARIO' } });
  show('/comunidades/4');
  await screen.findByRole('heading', { name: 'Club' });
  expect(screen.queryByRole('button', { name: 'Abandonar comunidad' })).not.toBeInTheDocument();
});
it('un error al abandonar conserva la comunidad y el diálogo', async () => {
  communities.leaveCommunity.mockRejectedValue(new Error('No se pudo abandonar'));
  show('/comunidades/4');
  fireEvent.click(await screen.findByRole('button', { name: 'Abandonar comunidad' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Abandonar comunidad' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo abandonar');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});
it('el abandono desde otra pestaña cierra la lista de integrantes', async () => {
  show('/comunidades/4/integrantes');
  await screen.findByText('Valen (vos)');
  communities.getCommunities.mockResolvedValue({ items: [] });
  fire('community:left', { idComunidad: 4 });
  await screen.findByRole('heading', { name: 'Comunidades', exact: true });
  expect(screen.queryByText('Valen (vos)')).not.toBeInTheDocument();
});

const otherMember = { ...member, rol: 'INTEGRANTE', usuario: { ...member.usuario, id: 2, nombreVisible: 'Luz' },
  rolesPersonalizados: [{ id: 7, nombre: 'Diseño' }] };

function asAdmin(rol = 'ADMIN') {
  communities.getCommunity.mockResolvedValue({ comunidad: { ...community, miRol: rol } });
  communities.getCommunityMembers.mockResolvedValue({ items: [{ ...member, rol }, otherMember] });
}

it('permite consultar los roles base y personalizados sin ofrecer mutaciones a moderadores', async () => {
  show('/comunidades/4/roles');
  expect(await screen.findByText('Diseño')).toBeInTheDocument();
  expect(screen.getByText('Propietario')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Crear rol' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Editar Diseño' })).not.toBeInTheDocument();
});

it('crea, renombra y elimina un rol desde el catálogo, con confirmación', async () => {
  asAdmin();
  show('/comunidades/4/roles');
  fireEvent.click(await screen.findByRole('button', { name: 'Crear rol' }));
  fireEvent.change(screen.getByLabelText('Nombre del rol'), { target: { value: 'Lectura' } });
  roles.createCommunityRole.mockImplementation(async () => {
    roles.getCommunityRoles.mockResolvedValue({ items: [{ id: 9, nombre: 'Lectura' }] });
    return { rol: { id: 9, nombre: 'Lectura' } };
  });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByText('Rol creado.')).toBeInTheDocument();
  expect(roles.createCommunityRole).toHaveBeenCalledWith(4, { nombre: 'Lectura' });
  fireEvent.click(await screen.findByRole('button', { name: 'Editar Lectura' }));
  fireEvent.change(screen.getByLabelText('Nombre del rol'), { target: { value: 'Escritura' } });
  roles.updateCommunityRole.mockImplementation(async () => {
    roles.getCommunityRoles.mockResolvedValue({ items: [{ id: 9, nombre: 'Escritura' }] });
  });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByText('Rol actualizado.')).toBeInTheDocument();
  expect(roles.updateCommunityRole).toHaveBeenCalledWith(4, 9, { nombre: 'Escritura' });
  fireEvent.click(await screen.findByRole('button', { name: 'Eliminar Escritura' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Se quitarán sus asignaciones y permisos');
  expect(roles.deleteCommunityRole).not.toHaveBeenCalled();
  roles.deleteCommunityRole.mockImplementation(async () => roles.getCommunityRoles.mockResolvedValue({ items: [] }));
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar rol' }));
  expect(await screen.findByText('Rol eliminado.')).toBeInTheDocument();
  expect(await screen.findByText('Todavía no hay roles personalizados.')).toBeInTheDocument();
});

it('evita envíos duplicados y conserva el nombre si el servidor rechaza el cambio', async () => {
  asAdmin();
  let reject;
  roles.updateCommunityRole.mockReturnValue(new Promise((_, fail) => { reject = fail; }));
  show('/comunidades/4/roles');
  const edit = await screen.findByRole('button', { name: 'Editar Diseño' });
  fireEvent.click(edit);
  fireEvent.change(screen.getByLabelText('Nombre del rol'), { target: { value: 'Eventos' } });
  const form = screen.getByRole('button', { name: 'Guardar' }).closest('form');
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(roles.updateCommunityRole).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Rol actualizado.')).not.toBeInTheDocument();
  await act(async () => reject(Object.assign(new Error('Ese nombre ya existe'), { status: 409 })));
  expect(await screen.findByText('Ese nombre ya existe')).toBeInTheDocument();
  expect(screen.getByLabelText('Nombre del rol')).toHaveValue('Eventos');
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(edit).toHaveFocus();
});

it('asigna varios roles, respeta la jerarquía y permite quitar todos', async () => {
  asAdmin();
  roles.updateCommunityMemberRoles.mockImplementation(async (_id, _user, body) => {
    const rolesPersonalizados = (body.idsRoles ?? [7]).map((id) => ({ id, nombre: id === 7 ? 'Diseño' : 'Eventos' }));
    communities.getCommunityMembers.mockResolvedValue({ items: [{ ...otherMember, rol: body.rol ?? 'MODERADOR', rolesPersonalizados }] });
  });
  show('/comunidades/4/integrantes');
  expect(await screen.findByText('Diseño')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Editar roles de Valen' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Editar roles de Luz' }));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).queryByRole('option', { name: 'Administrador' })).not.toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText('Rol base'), { target: { value: 'MODERADOR' } });
  fireEvent.click(within(dialog).getByLabelText('Eventos'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByText('Roles actualizados.')).toBeInTheDocument();
  expect(roles.updateCommunityMemberRoles).toHaveBeenLastCalledWith(4, 2, { rol: 'MODERADOR', idsRoles: [7, 8] });
  expect(await screen.findByText('Eventos')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Editar roles de Luz' }));
  const next = within(screen.getByRole('dialog'));
  fireEvent.click(next.getByLabelText('Diseño'));
  fireEvent.click(next.getByLabelText('Eventos'));
  fireEvent.click(next.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(roles.updateCommunityMemberRoles).toHaveBeenLastCalledWith(4, 2, { idsRoles: [] }));
});

it('bloquea guardar si un cambio remoto vuelve obsoleto el formulario de integrante', async () => {
  asAdmin('PROPIETARIO');
  show('/comunidades/4/integrantes');
  fireEvent.click(await screen.findByRole('button', { name: 'Editar roles de Luz' }));
  expect(within(screen.getByRole('dialog')).getByRole('option', { name: 'Administrador' })).toBeInTheDocument();
  communities.getCommunityMembers.mockResolvedValue({ items: [{ ...otherMember, rol: 'MODERADOR' }] });
  fire('community:member-updated', { idComunidad: 4, integrante: otherMember });
  expect(await screen.findByText(/Los roles cambiaron/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  expect(roles.updateCommunityMemberRoles).not.toHaveBeenCalled();
});

it('actualiza el catálogo por socket y oculta acciones cuando se pierde autoridad', async () => {
  asAdmin();
  show('/comunidades/4/roles');
  await screen.findByRole('button', { name: 'Editar Diseño' });
  roles.getCommunityRoles.mockResolvedValue({ items: [{ id: 7, nombre: 'Diseño actualizado' }] });
  fire('community:role-updated', { idComunidad: 4, rol: { id: 7, nombre: 'Diseño actualizado' } });
  await screen.findByRole('button', { name: 'Editar Diseño actualizado' });
  communities.getCommunity.mockResolvedValue({ comunidad: { ...community, miRol: 'INTEGRANTE' } });
  fire('community:member-updated', { idComunidad: 4, integrante: { ...member, rol: 'INTEGRANTE' } });
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Crear rol' })).not.toBeInTheDocument());
  expect(screen.getByText('Diseño actualizado')).toBeInTheDocument();
});

it('un moderador puede banear a un integrante y levantar el baneo sin restaurar su membresía', async () => {
  const target = { ...member, usuario: { ...member.usuario, id: 2, nombreVisible: 'Ana', nombreUsuario: 'ana' }, rol: 'INTEGRANTE' };
  communities.getCommunityMembers.mockResolvedValue({ items: [member, target] });
  bans.banCommunityMember.mockImplementation(async () => {
    communities.getCommunityMembers.mockResolvedValue({ items: [member] });
  });
  bans.getCommunityBans.mockResolvedValue({ items: [{ usuario: target.usuario, autor: member.usuario, motivo: 'Incumplimiento', fechaCreacion: community.fechaCreacion }] });
  bans.removeCommunityBan.mockImplementation(async () => { bans.getCommunityBans.mockResolvedValue({ items: [] }); });
  show('/comunidades/4/integrantes');
  const button = await screen.findByRole('button', { name: 'Banear a Ana' });
  expect(screen.queryByRole('button', { name: 'Banear a Valen' })).not.toBeInTheDocument();
  expect(bans.getCommunityBans).not.toHaveBeenCalled();
  fireEvent.click(button);
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
  expect(bans.banCommunityMember).not.toHaveBeenCalled();
  fireEvent.click(button);
  fireEvent.change(screen.getByLabelText('Motivo (opcional)'), { target: { value: ' Incumplimiento ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar baneo' }));
  await screen.findByText('El integrante fue baneado.');
  expect(bans.banCommunityMember).toHaveBeenCalledExactlyOnceWith(4, 2, 'Incumplimiento');
  expect(screen.queryByRole('button', { name: 'Banear a Ana' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ver baneos' }));
  await screen.findByText('Motivo: Incumplimiento');
  fireEvent.click(screen.getByRole('button', { name: 'Levantar baneo de Ana' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar desbloqueo' }));
  await screen.findByText('Se levantó el baneo.');
  expect(bans.removeCommunityBan).toHaveBeenCalledExactlyOnceWith(4, 2);
  expect(screen.queryByRole('button', { name: 'Banear a Ana' })).not.toBeInTheDocument();
});
