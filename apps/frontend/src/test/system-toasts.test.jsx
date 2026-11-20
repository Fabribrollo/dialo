import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import SystemToasts from '../components/shell/SystemToasts.jsx';
import { avisar, cerrarAviso, leerAvisos } from '../components/shell/systemToastsStore.js';

const mock = vi.hoisted(() => ({ listeners: new Map(), socket: { on: vi.fn(), off: vi.fn() } }));
vi.mock('../hooks/useSocket.js', () => ({ useSocket: () => mock.socket }));

beforeEach(() => {
  mock.listeners.clear();
  mock.socket.on.mockImplementation((event, fn) => mock.listeners.set(event, fn));
  for (const a of leerAvisos()) cerrarAviso(a.key);
});

const show = () => render(<MemoryRouter initialEntries={['/']}><Routes>
  <Route path="/" element={<SystemToasts />} />
  <Route path="/comunidades/3/canales/9" element={<h1>Canal de voz</h1>} />
</Routes></MemoryRouter>);

test('si se corta la conexión avisa que reconecta y después que volvió', () => {
  show();
  act(() => mock.listeners.get('disconnect')());
  expect(screen.getByText('Reconectando…')).toBeInTheDocument();
  act(() => mock.listeners.get('connect')());
  expect(screen.queryByText('Reconectando…')).not.toBeInTheDocument();
  expect(screen.getByText('Conectado de nuevo')).toBeInTheDocument();
});

test('la invitación a una llamada lleva al canal de voz', () => {
  show();
  act(() => { avisar({ id: 'llamada-3', tipo: 'invitacion', canal: 'estudio', comunidad: 'Taller de Redes', personas: ['Tomi', 'Cande', 'Lu'], total: 4, destino: '/comunidades/3/canales/9', siglas: 'TR' }); });
  expect(screen.getByText('Llamada en estudio')).toBeInTheDocument();
  expect(screen.getByText('Tomi, Cande y 2 más están en la llamada · Taller de Redes')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Unirme' }));
  expect(screen.getByRole('heading', { name: 'Canal de voz' })).toBeInTheDocument();
});

test('un aviso con acción la ejecuta y se cierra', () => {
  const reintentar = vi.fn();
  show();
  act(() => { avisar({ tipo: 'error', texto: 'No se pudo enviar el mensaje', accion: { label: 'Reintentar', fn: reintentar } }); });
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(reintentar).toHaveBeenCalled();
  expect(screen.queryByText('No se pudo enviar el mensaje')).not.toBeInTheDocument();
});
