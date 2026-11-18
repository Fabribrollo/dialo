import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';
import Sidebar from '../components/shell/Sidebar.jsx';

vi.mock('../hooks/useAuth.js', () => ({ useAuth: () => ({ usuario: { nombreVisible: 'Fabri', disponibilidad: 'EN_LINEA' } }) }));
vi.mock('../hooks/useFriends.js', () => ({ useFriends: () => ({ recibidas: [{}, {}] }) }));
vi.mock('../context/ConversationsContext.jsx', () => ({
  useConversations: () => ({ items: [{ id: 7, otroUsuario: { nombreVisible: 'Cande Ríos', nombreUsuario: 'cande' }, ultimoMensaje: { contenido: 'Mandame la foto', fechaCreacion: new Date().toISOString() } }] }),
}));
vi.mock('../context/CommunitiesContext.jsx', () => ({ useCommunities: () => ({ items: [{ id: 3, nombre: 'Taller de Redes' }] }) }));

it('filtra entre personas y comunidades, y muestra la fila de Amigos en Personas', () => {
  render(<MemoryRouter initialEntries={['/conversaciones/7']}><Sidebar /></MemoryRouter>);
  expect(screen.getByRole('link', { name: /Cande Ríos/ })).toHaveAttribute('href', '/conversaciones/7');
  expect(screen.getByRole('link', { name: /Taller de Redes/ })).toBeInTheDocument();
  expect(screen.queryByText('Amigos')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('tab', { name: 'Personas' }));
  expect(screen.getByText('2 solicitudes nuevas')).toBeInTheDocument();
  expect(screen.queryByText('Taller de Redes')).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'zzz' } });
  expect(screen.queryByText('Cande Ríos')).not.toBeInTheDocument();
});

it('en Todo no se muestran las filas fijas aunque estés en Amigos o Comunidades', () => {
  render(<MemoryRouter initialEntries={['/amigos']}><Sidebar /></MemoryRouter>);
  expect(screen.queryByText('Amigos')).not.toBeInTheDocument();
  expect(screen.queryByText('Mis comunidades')).not.toBeInTheDocument();
});

it('el filtro Comunidades filtra el lateral y suma la fila Mis comunidades', () => {
  render(<MemoryRouter initialEntries={['/conversaciones/7']}><Sidebar /></MemoryRouter>);
  expect(screen.queryByText('Mis comunidades')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Comunidades' }));
  expect(screen.getByRole('link', { name: /Mis comunidades/ })).toHaveAttribute('href', '/comunidades');
  expect(screen.getByRole('link', { name: /Taller de Redes/ })).toBeInTheDocument();
  expect(screen.queryByText('Cande Ríos')).not.toBeInTheDocument();
});
