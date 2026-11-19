import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import LandingPage from '../pages/LandingPage.jsx';

function show() {
  return render(<MemoryRouter initialEntries={['/inicio']}><Routes>
    <Route path="/inicio" element={<LandingPage />} />
    <Route path="/register" element={<h1>Registro</h1>} />
    <Route path="/login" element={<h1>Login</h1>} />
  </Routes></MemoryRouter>);
}

it('presenta Dialo y ofrece crear cuenta o entrar', () => {
  show();
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Dialo');
  expect(screen.getAllByRole('button', { name: /Crear cuenta/ }).length).toBeGreaterThan(0);
  expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login');
  expect(screen.getByRole('link', { name: 'Ya tengo cuenta' })).toHaveAttribute('href', '/login');
});

it('crear cuenta lleva al registro despues de la animacion', async () => {
  show();
  fireEvent.click(screen.getAllByRole('button', { name: /Crear cuenta/ })[0]);
  expect(await screen.findByRole('heading', { name: 'Registro' }, { timeout: 3000 })).toBeInTheDocument();
});
