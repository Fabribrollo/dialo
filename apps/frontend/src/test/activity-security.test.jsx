import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router';
import ActivityCenter from '../components/shell/ActivityCenter.jsx';
import { contenidoDelAviso } from '../components/shell/NotificationToasts.jsx';
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), listeners: new Map(), on: vi.fn(), off: vi.fn(), emit: vi.fn() }));
vi.mock('../services/api.js', () => ({ api: { get: mocks.get, post: mocks.post } }));
vi.mock('../hooks/useSocket.js', () => ({ useSocket: () => mocks }));
const empty = { items: [], noLeidas: 0, nextCursor: null };
const notice = (tipo, contexto = {}) => ({ id: 1, tipo, referencia: 7, leida: false, contexto, fechaCreacion: new Date().toISOString() });
function Location() { return <output aria-label="Ruta">{useLocation().pathname}</output>; }
function mount() { render(<MemoryRouter initialEntries={['/amigos']}><ActivityCenter /><Location /></MemoryRouter>); }
beforeEach(() => {
  vi.clearAllMocks(); mocks.listeners.clear();
  mocks.on.mockImplementation((event, fn) => mocks.listeners.set(event, fn));
  mocks.get.mockResolvedValue(empty); mocks.post.mockResolvedValue({});
});
test.each(['baneo', 'rehabilitado'])('%s usa el panel actual, permite leer sin navegar a una comunidad', async (tipo) => {
  mocks.get.mockResolvedValue({ items: [notice(tipo)], noLeidas: 1 }); mount();
  fireEvent.click(await screen.findByLabelText('Notificaciones: 1 sin leer'));
  const item = await screen.findByRole('button', { name: /Entendido/ });
  expect(item).toHaveClass('act-item', 'is-new');
  fireEvent.click(item);
  await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/notifications/read', { tipo, referencia: 7 }));
  expect(screen.getByLabelText('Ruta')).toHaveTextContent('/amigos');
  expect(mocks.get.mock.calls.every(([url]) => url === '/notifications')).toBe(true);
});
test('roles revalida acceso antes de abrir integrantes', async () => {
  mocks.get.mockImplementation(async (url) => url === '/notifications' ? { items: [notice('roles', { nombre: 'Equipo', idComunidad: 7 })], noLeidas: 1 } : {});
  mount(); fireEvent.click(await screen.findByLabelText('Notificaciones: 1 sin leer'));
  fireEvent.click(await screen.findByRole('button', { name: /Tus roles cambiaron/ }));
  await waitFor(() => expect(screen.getByLabelText('Ruta')).toHaveTextContent('/comunidades/7/integrantes'));
  expect(mocks.get).toHaveBeenCalledWith('/communities/7');
});
test('un destino revocado entre listado y clic conserva el panel y explica el problema', async () => {
  mocks.get.mockImplementation(async (url) => {
    if (url === '/channels/7') throw new Error('Sin acceso');
    return { items: [notice('canal', { nombre: 'Reservado', idComunidad: 3 })], noLeidas: 1 };
  });
  mount(); fireEvent.click(await screen.findByLabelText('Notificaciones: 1 sin leer'));
  fireEvent.click(await screen.findByRole('button', { name: /Abrir canal/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent('tu acceso cambió');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByLabelText('Ruta')).toHaveTextContent('/amigos');
});
test('revocar limpia el texto del aviso flotante incluso si falla la recarga', async () => {
  mount(); await waitFor(() => expect(mocks.get).toHaveBeenCalled());
  mocks.get.mockResolvedValue({ items: [{ ...notice('canal', { nombre: 'Privado' }), vista: { autor: 'Ana', texto: 'Contenido reservado' } }], noLeidas: 1 });
  await act(async () => mocks.listeners.get('notifications:changed')());
  expect(await screen.findByText('Contenido reservado')).toBeInTheDocument();
  mocks.get.mockRejectedValue(new Error('Sin conexión'));
  await act(async () => mocks.listeners.get('channel:access-lost')());
  expect(screen.queryByText('Contenido reservado')).not.toBeInTheDocument();
});
test('avisos de acceso usan las acciones y el lenguaje del diseño actual', () => {
  expect(contenidoDelAviso({ tipo: 'acceso', contexto: {} })).toMatchObject({ principal: 'Entendido', titulo: 'Tu acceso cambió', canal: true });
  expect(contenidoDelAviso({ tipo: 'roles', contexto: { idComunidad: 3, nombre: 'Equipo' } })).toMatchObject({ principal: 'Ver cambios', nombre: 'Dialo' });
});
test('una revocación descarta una apertura cuya comprobación seguía pendiente', async () => {
  let resolve;
  const pending = new Promise((r) => { resolve = r; });
  mocks.get.mockImplementation((url) => url === '/channels/7' ? pending : Promise.resolve({ items: [notice('canal', { nombre: 'Reservado', idComunidad: 3 })], noLeidas: 1 }));
  mount(); fireEvent.click(await screen.findByLabelText('Notificaciones: 1 sin leer'));
  fireEvent.click(await screen.findByRole('button', { name: /Abrir canal/ }));
  mocks.get.mockResolvedValue(empty);
  await act(async () => mocks.listeners.get('channel:access-lost')());
  await act(async () => resolve({ canal: { idComunidad: 3 } }));
  expect(screen.getByLabelText('Ruta')).toHaveTextContent('/amigos');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});
