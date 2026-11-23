import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import Avatar from '../components/ui/Avatar.jsx';
import { SkeletonRows } from '../components/ui/Skeleton.jsx';
import { aplicarTema, guardarTema, leerTema } from '../utils/theme.js';

test('si la foto no carga muestra la inicial en lugar de una imagen rota', () => {
  const { container } = render(<Avatar nombre="Lu Gómez" foto="/fotos/no-existe.jpg" />);
  fireEvent.error(container.querySelector('img'));
  expect(container.querySelector('img')).toBeNull();
  expect(container).toHaveTextContent('L');
});

test('una foto nueva vuelve a intentarse después de un error', () => {
  const { container, rerender } = render(<Avatar nombre="Lu" foto="/a.jpg" />);
  fireEvent.error(container.querySelector('img'));
  rerender(<Avatar nombre="Lu" foto="/b.jpg" />);
  expect(container.querySelector('img')).toHaveAttribute('src', '/b.jpg');
});

test('el esqueleto de carga se anuncia una sola vez con su texto', () => {
  render(<SkeletonRows rows={3} label="Cargando amigos…" />);
  expect(screen.getByRole('status')).toHaveTextContent('Cargando amigos…');
});

test('el tema guardado se aplica y sin preferencia sigue al sistema', () => {
  localStorage.removeItem('dialo:tema');
  expect(leerTema()).toBe('sistema');
  guardarTema('oscuro');
  expect(document.documentElement.dataset.theme).toBe('oscuro');
  aplicarTema('claro');
  expect(document.documentElement.dataset.theme).toBe('claro');
  localStorage.removeItem('dialo:tema');
});
