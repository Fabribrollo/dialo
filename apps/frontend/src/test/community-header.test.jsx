import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import { CommunityHeader } from '../components/communities/CommunityNav.jsx';

const comunidad = { id: 4, nombre: 'Taller de Redes', tipo: 'PUBLICA', miRol: 'PROPIETARIO', imagenUrl: null };
const show = (props) => render(<MemoryRouter initialEntries={['/comunidades/4/canales/2']}><CommunityHeader comunidad={comunidad} {...props} /></MemoryRouter>);

it('fuera de un canal muestra las secciones siempre', () => {
  show();
  expect(screen.getByRole('tablist', { name: 'Secciones de la comunidad' })).toBeInTheDocument();
});

it('dentro de un canal las secciones se abren tocando la comunidad', () => {
  show({ collapsible: true });
  expect(screen.queryByRole('tablist', { name: 'Secciones de la comunidad' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Editar comunidad/ })).not.toBeInTheDocument();
  const boton = screen.getByRole('button', { name: /Taller de Redes/ });
  fireEvent.click(boton);
  expect(boton).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('tablist', { name: 'Secciones de la comunidad' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Editar comunidad/ })).toBeInTheDocument();
  fireEvent.click(boton);
  expect(screen.queryByRole('tablist', { name: 'Secciones de la comunidad' })).not.toBeInTheDocument();
});
