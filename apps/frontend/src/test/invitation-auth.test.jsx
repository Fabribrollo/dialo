import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import { AuthProvider } from '../context/AuthContext.jsx';
import GuestRoute from '../components/GuestRoute.jsx';
import ProtectedRoute from '../components/ProtectedRoute.jsx';
import LoginPage from '../pages/LoginPage.jsx';
import RegisterPage from '../pages/RegisterPage.jsx';
import * as auth from '../services/authService.js';
import { invitationReturnPath, pendingInvitation, rememberInvitation } from '../utils-invitations.js';

vi.mock('../services/authService.js', () => ({ getMe: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn(), forgotPassword: vi.fn(), resetPassword: vi.fn() }));
function Destination() { return <h1>Invitación {useParams().codigo}</h1>; }
function show(path) {
  return render(<MemoryRouter initialEntries={[path]}><AuthProvider><Routes>
    <Route element={<GuestRoute />}><Route path="/login" element={<LoginPage />} /><Route path="/register" element={<RegisterPage />} /></Route>
    <Route element={<ProtectedRoute />}><Route path="/invitacion/:codigo" element={<Destination />} /><Route path="/" element={<h1>Inicio</h1>} /></Route>
  </Routes></AuthProvider></MemoryRouter>);
}
beforeEach(() => {
  sessionStorage.clear();
  auth.getMe.mockReset().mockRejectedValue({ status: 401 });
  auth.login.mockReset().mockResolvedValue({ usuario: { id: 1 } });
  auth.register.mockReset().mockResolvedValue({ usuario: { id: 1 } });
});
it('conserva el destino de la invitación al iniciar sesión', async () => {
  show('/invitacion/test_code');
  await screen.findByRole('heading', { name: 'Iniciar sesión' });
  expect(pendingInvitation()).toBe('/invitacion/test_code');
  fireEvent.change(screen.getByLabelText('Usuario o correo'), { target: { value: 'valen' } });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'ClavePrueba123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  await screen.findByRole('heading', { name: 'Invitación test_code' });
});
it('pasar a registro conserva la invitación y vuelve a ella después de registrarse', async () => {
  show('/invitacion/otro_codigo');
  fireEvent.click(await screen.findByRole('link', { name: 'Registrate' }));
  await screen.findByRole('heading', { name: 'Crear cuenta' });
  fireEvent.change(screen.getByLabelText('Nombre de usuario'), { target: { value: 'nuevo' } });
  fireEvent.change(screen.getByLabelText('Nombre visible'), { target: { value: 'Nuevo' } });
  fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'nuevo@example.test' } });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'ClavePrueba123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Registrarme' }));
  await screen.findByRole('heading', { name: 'Invitación otro_codigo' });
});
it('recupera el destino de la invitación después de recargar el formulario de acceso', async () => {
  rememberInvitation('/invitacion/persistida');
  show('/login');
  await screen.findByRole('heading', { name: 'Iniciar sesión' });
  fireEvent.change(screen.getByLabelText('Usuario o correo'), { target: { value: 'valen' } });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'ClavePrueba123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  await screen.findByRole('heading', { name: 'Invitación persistida' });
});
it('rechaza destinos externos o rutas arbitrarias en el regreso de autenticación', async () => {
  for (const value of ['https://otro.test', '//otro.test', '/perfil', '/invitacion/a?next=otro', '/invitacion/%2f%2fmal']) expect(invitationReturnPath(value)).toBeNull();
  sessionStorage.setItem('dialo_pending_invitation', 'https://otro.test');
  auth.getMe.mockResolvedValue({ usuario: { id: 1 } });
  show({ pathname: '/login', state: { from: '//otro.test' } });
  await screen.findByRole('heading', { name: 'Inicio' });
});
