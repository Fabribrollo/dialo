import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import { AuthContext } from '../context/AuthContext.jsx';
import GuestRoute from '../components/GuestRoute.jsx';
import ProtectedRoute from '../components/ProtectedRoute.jsx';
import LandingPage from '../pages/LandingPage.jsx';
import { createGlassStage } from '../components/landing/glassStage.js';
import { rememberInvitation } from '../utils/invitations.js';

// jsdom verifica contenido y navegación; el render de canvas se prueba en navegador.
vi.mock('../components/landing/glassStage.js',async importOriginal=>({...await importOriginal(),createGlassStage:vi.fn(()=>({stop:vi.fn(),word:vi.fn(),update:vi.fn()}))}));
afterEach(() => { sessionStorage.clear(); vi.unstubAllGlobals(); });
function Invitation() { return <h1>Invitación {useParams().codigo}</h1>; }
function show(path='/inicio', estado='noLogueado') {
  return render(<MemoryRouter initialEntries={[path]}><AuthContext.Provider value={{estado,salio:false}}><Routes>
    <Route element={<GuestRoute />}>
      <Route path="/inicio" element={<LandingPage />} />
      <Route path="/register" element={<h1>Registro</h1>} />
      <Route path="/login" element={<h1>Login</h1>} />
    </Route>
    <Route element={<ProtectedRoute />}>
      <Route path="/" element={<h1>Conversaciones</h1>} />
      <Route path="/invitacion/:codigo" element={<Invitation />} />
    </Route>
  </Routes></AuthContext.Provider></MemoryRouter>);
}
function scrollTo(progress) {
  const scroll=screen.getByRole('region',{name:'Recorrido de Dialo'});
  Object.defineProperties(scroll,{scrollHeight:{configurable:true,value:7000},clientHeight:{configurable:true,value:1000},scrollTop:{configurable:true,value:6000*progress}});
  fireEvent.scroll(scroll);return scroll;
}

it('presenta Dialo y ofrece crear cuenta o entrar desde la raíz pública', () => {
  show('/');
  expect(screen.getByRole('main')).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Dialo');
  expect(screen.getAllByRole('button', { name: /Crear cuenta/ }).length).toBeGreaterThan(0);
  expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login');
  expect(document.title).toBe('Dialo: mensajes, voz y comunidades');
});

it('crear cuenta lleva al registro después de la animación y entrar abre login', async () => {
  const page=show();
  fireEvent.click(screen.getByRole('link',{name:'Entrar'}));
  expect(screen.getByRole('heading',{name:'Login'})).toBeInTheDocument();page.unmount();
  show();
  fireEvent.click(screen.getAllByRole('button', { name: /Crear cuenta/ })[0]);
  expect(await screen.findByRole('heading', { name: 'Registro' }, { timeout: 3000 })).toBeInTheDocument();
});

it('expone las cuatro funciones a lectores de pantalla sin depender del canvas', () => {
  show();
  const info=screen.getByRole('region',{name:'Qué podés hacer en Dialo'});
  expect(within(info).getAllByRole('listitem')).toHaveLength(4);
  for(const text of ['Mensajes privados que llegan al instante','Canales de voz para entrar y salir cuando quieras','Prendé la cámara o compartí tu pantalla','Comunidades con canales de texto y de voz']) expect(within(info).getByText(text)).toBeInTheDocument();
});

it('retira controles invisibles del foco y devuelve el foco al recorrido al ocultarlos', () => {
  show();
  const final=document.querySelector('.landing-final'),inicio=screen.getByRole('region',{name:'Inicio'}),nav=screen.getByRole('navigation',{name:'Principal'});
  expect(final).toHaveAttribute('inert');expect(screen.queryByRole('link',{name:'Ya tengo cuenta'})).not.toBeInTheDocument();
  within(inicio).getByRole('button',{name:'Crear cuenta'}).focus();
  const scroll=scrollTo(.2);
  expect(inicio).toHaveAttribute('inert');expect(scroll).toHaveFocus();
  within(nav).getByRole('link',{name:'Entrar'}).focus();scrollTo(1);
  expect(nav).toHaveAttribute('inert');expect(final).not.toHaveAttribute('inert');expect(scroll).toHaveFocus();
  expect(screen.getByRole('link',{name:'Ya tengo cuenta'})).toHaveAttribute('href','/login');
  scrollTo(0);expect(nav).not.toHaveAttribute('inert');expect(final).toHaveAttribute('inert');
});

it('sin WebGL conserva texto y acciones de acceso', () => {
  createGlassStage.mockImplementationOnce(logic=>{logic.noGL();return {stop:vi.fn(),word:vi.fn()};});
  show();expect(document.querySelector('canvas')).not.toBeInTheDocument();
  expect(document.querySelector('.landing-hero-plano')).toHaveTextContent('Donde se juntatu gente');
  expect(screen.getByRole('link',{name:'Entrar'})).toHaveAttribute('href','/login');
  scrollTo(1);expect(screen.getByRole('button',{name:'Crear cuenta'})).toBeInTheDocument();
});

it('movimiento reducido permite crear una cuenta sin esperar la animación', async () => {
  vi.stubGlobal('matchMedia',vi.fn(()=>({matches:true})));
  show();fireEvent.click(screen.getAllByRole('button',{name:'Crear cuenta'})[0]);
  expect(await screen.findByRole('heading',{name:'Registro'})).toBeInTheDocument();
});

it('con sesión entra directamente a la app y respeta una invitación pendiente', () => {
  const first=show('/inicio','logueado');expect(screen.getByRole('heading',{name:'Conversaciones'})).toBeInTheDocument();first.unmount();
  rememberInvitation('/invitacion/pendiente');show('/inicio','logueado');
  expect(screen.getByRole('heading',{name:'Invitación pendiente'})).toBeInTheDocument();
});

it('no sustituye el destino de invitación por la landing cuando falta sesión', () => {
  show('/invitacion/codigo');expect(screen.getByRole('heading',{name:'Login'})).toBeInTheDocument();
  expect(sessionStorage.getItem('dialo_pending_invitation')).toBe('/invitacion/codigo');
});

it('al salir de la landing restaura el título y detiene el render de la escena', () => {
  document.title='Dialo';const page=show();const stage=createGlassStage.mock.results.at(-1).value;
  page.unmount();expect(document.title).toBe('Dialo');expect(stage.stop).toHaveBeenCalledTimes(1);
});
