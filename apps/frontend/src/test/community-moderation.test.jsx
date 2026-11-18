import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import CommunityModerationPage from '../pages/CommunityModerationPage.jsx';
import { getCommunityModeration, replaceCommunityModeration } from '../services/communityModerationService.js';

const detail = vi.hoisted(() => ({ current: null }));
vi.mock('../hooks/useCommunity.js', () => ({ useCommunity: () => detail.current }));
vi.mock('../pages/CommunityPage.jsx', () => ({ CommunityState: () => null, useLostCommunity: () => {} }));
vi.mock('../services/communityModerationService.js', () => ({
  getCommunityModeration: vi.fn(), replaceCommunityModeration: vi.fn(),
}));

function renderPage(miRol = 'ADMIN') {
  detail.current = { comunidad: { id: 7, nombre: 'Dialo', miRol }, valid: true, lost: false, reload: vi.fn() };
  return render(<MemoryRouter initialEntries={['/comunidades/7/moderacion']}>
    <Routes><Route path="/comunidades/:id/moderacion" element={<CommunityModerationPage />} /></Routes>
  </MemoryRouter>);
}

beforeEach(() => {
  getCommunityModeration.mockResolvedValue({ moderacion: { activa: false, reglas: ['spam'] } });
});

it('muestra la configuración guardada', async () => {
  renderPage();
  expect(await screen.findByText('spam')).toBeInTheDocument();
  expect(screen.getByLabelText('Moderar mensajes con IA')).not.toBeChecked();
  expect(getCommunityModeration).toHaveBeenCalledWith(7);
});

it('agrega una regla, activa la moderación y guarda la lista completa', async () => {
  replaceCommunityModeration.mockImplementation(async (id, body) => ({ moderacion: body }));
  renderPage();
  await screen.findByText('spam');
  fireEvent.click(screen.getByLabelText('Moderar mensajes con IA'));
  fireEvent.change(screen.getByLabelText('Nueva regla'), { target: { value: '  política  ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(replaceCommunityModeration).toHaveBeenCalledWith(7, { activa: true, reglas: ['spam', 'política'] }));
  expect(await screen.findByText('Moderación guardada')).toBeInTheDocument();
});

it('no permite reglas repetidas y permite quitarlas', async () => {
  renderPage();
  await screen.findByText('spam');
  fireEvent.change(screen.getByLabelText('Nueva regla'), { target: { value: 'SPAM' } });
  fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Esa regla ya está en la lista.');
  fireEvent.click(screen.getByRole('button', { name: 'Quitar spam' }));
  expect(screen.queryByRole('button', { name: 'Quitar spam' })).not.toBeInTheDocument();
});

it('un integrante no ve el formulario ni consulta la configuración', () => {
  renderPage('INTEGRANTE');
  expect(screen.getByText(/Solo propietarios y administradores/)).toBeInTheDocument();
  expect(getCommunityModeration).not.toHaveBeenCalled();
});
