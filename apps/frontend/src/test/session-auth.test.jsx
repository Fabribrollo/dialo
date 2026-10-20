import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AuthProvider } from '../context/AuthContext.jsx';
import GuestRoute from '../components/GuestRoute.jsx';
import ProtectedRoute from '../components/ProtectedRoute.jsx';
import * as auth from '../services/authService.js';

vi.mock('../services/authService.js', () => ({ getMe: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn(), forgotPassword: vi.fn(), resetPassword: vi.fn() }));

function show(path) {
  return render(<MemoryRouter initialEntries={[path]}><AuthProvider><Routes>
    <Route element={<GuestRoute />}><Route path="/login" element={<h1>Login</h1>} /></Route>
    <Route element={<ProtectedRoute />}><Route path="/" element={<h1>Inicio</h1>} /></Route>
  </Routes></AuthProvider></MemoryRouter>);
}
const sinConexion = { status: 0, code: 'NETWORK_ERROR', message: 'No se pudo conectar con el servidor' };

beforeEach(() => {
  auth.getMe.mockReset();
});

it('una falla de red no manda al login y permite reintentar', async () => {
  auth.getMe.mockRejectedValueOnce(sinConexion).mockResolvedValueOnce({ usuario: { id: 1 } });
  show('/');
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar con el servidor');
  expect(screen.queryByRole('heading', { name: 'Login' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await screen.findByRole('heading', { name: 'Inicio' });
});

it('un error del servidor no se trata como falta de sesion', async () => {
  auth.getMe.mockRejectedValueOnce({ status: 500, code: 'INTERNAL_ERROR', message: 'Error interno del servidor' });
  show('/');
  expect(await screen.findByRole('alert')).toHaveTextContent('El servidor no responde');
  expect(screen.queryByRole('heading', { name: 'Login' })).not.toBeInTheDocument();
});

it('la pantalla de login tambien ofrece reintentar si no se pudo verificar', async () => {
  auth.getMe.mockRejectedValueOnce(sinConexion).mockRejectedValueOnce({ status: 401, code: 'UNAUTHORIZED' });
  show('/login');
  fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
  await screen.findByRole('heading', { name: 'Login' });
});

it('solo un 401 manda al login', async () => {
  auth.getMe.mockRejectedValueOnce({ status: 401, code: 'UNAUTHORIZED' });
  show('/');
  await screen.findByRole('heading', { name: 'Login' });
});
