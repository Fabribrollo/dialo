import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import CommunityDashboard from '../components/communities/CommunityDashboard.jsx';
import { useChannels } from '../hooks/useChannels.js';
import { useCommunityCollection } from '../hooks/useCommunityCollection.js';
vi.mock('../hooks/useChannels.js', () => ({ useChannels: vi.fn() }));
vi.mock('../hooks/useCommunityCollection.js', () => ({ useCommunityCollection: vi.fn() }));
vi.mock('../hooks/useSocket.js', () => ({ useSocket: () => null }));
let channels, members;
const community = { id: 4, nombre: 'Club' };
const channel = (id) => ({ id, nombre: `canal-${id}`, tipo: 'TEXTO', privado: id === 2 });
const person = (id, disponibilidad = 'EN_LINEA') => ({ usuario: { id, nombreVisible: `Persona ${id}`, nombreUsuario: `persona${id}`, disponibilidad }, rol: 'INTEGRANTE' });
const view = () => render(<MemoryRouter><CommunityDashboard comunidad={community} /></MemoryRouter>);
beforeEach(() => {
  channels = { items: [channel(1), channel(2)], loading: false, error: null, reload: vi.fn() };
  members = { items: [person(1), person(2, 'AUSENTE')], loading: false, error: null, reload: vi.fn() };
  useChannels.mockImplementation(() => channels);
  useCommunityCollection.mockImplementation(() => members);
});
it('abre los canales reales por ID y resume los integrantes', () => {
  view();
  expect(screen.getByRole('link', { name: /canal-2/ })).toHaveAttribute('href', '/comunidades/4/canales/2');
  expect(screen.getByRole('link', { name: 'Ver canales' })).toHaveAttribute('href', '/comunidades/4/canales');
  expect(screen.getByRole('link', { name: 'Ver integrantes' })).toHaveAttribute('href', '/comunidades/4/integrantes');
  expect(screen.getByText('integrantes, 1 en línea')).toBeInTheDocument();
});
it('distingue cargas, vacíos y errores con reintento independiente', () => {
  channels = { ...channels, items: [], error: new Error('Sin red') };
  members = { ...members, items: [], loading: true };
  const mounted = view();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar canales' }));
  expect(channels.reload).toHaveBeenCalledOnce();
  expect(screen.getByRole('status')).toHaveTextContent('Cargando integrantes');
  channels = { ...channels, error: null };
  members = { ...members, loading: false };
  mounted.rerender(<MemoryRouter><CommunityDashboard comunidad={community} /></MemoryRouter>);
  expect(screen.getByText('No hay canales disponibles para tu cuenta.')).toBeInTheDocument();
  expect(screen.getByText('No hay integrantes para mostrar.')).toBeInTheDocument();
});
it('acota la vista previa de canales y apila los integrantes de más', () => {
  channels.items = Array.from({ length: 10 }, (_, i) => channel(i + 1));
  members.items = Array.from({ length: 9 }, (_, i) => person(i + 1));
  view();
  expect(screen.queryByRole('link', { name: /canal-9/ })).not.toBeInTheDocument();
  expect(screen.getByText('+5')).toBeInTheDocument();
});
it('voz y video existentes se muestran como canal de voz, sin botones de llamada', () => {
  channels.items = [{ ...channel(8), tipo: 'VOZ' }, { ...channel(9), tipo: 'VIDEO' }];
  view();
  expect(screen.getAllByText('Pública')).toHaveLength(2);
  expect(screen.queryByRole('button', { name: /llamar|conectar/i })).not.toBeInTheDocument();
});
