import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import AuthError from '../components/AuthError.jsx';
import SharedFiles from '../components/chat/SharedFiles.jsx';
import MentionPicker from '../components/chat/MentionPicker.jsx';
import OwnershipTransfer from '../components/communities/OwnershipTransfer.jsx';
import ActivityCenter from '../components/shell/ActivityCenter.jsx';
import { useMessageSearch } from '../hooks/useMessageSearch.js';
const mocks=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),listeners:new Map(),on:vi.fn(),off:vi.fn(),emit:vi.fn()}));
vi.mock('../services/api.js',()=>({api:{get:mocks.get,post:mocks.post}}));
vi.mock('../hooks/useSocket.js',()=>({useSocket:()=>mocks}));
beforeEach(()=>{vi.clearAllMocks();mocks.listeners.clear();mocks.on.mockImplementation((event,fn)=>mocks.listeners.set(event,fn));mocks.get.mockResolvedValue({items:[],noLeidas:0});mocks.post.mockResolvedValue({});});
afterEach(()=>vi.useRealTimers());
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
test('el contador usa Retry-After y llega a cero',()=>{
  vi.useFakeTimers();render(<AuthError error={{code:'RATE_LIMITED',retryAfter:2}} rateLimitText="Ya podés reintentar"/>);
  expect(screen.getByText('Podés reintentar en 2 segundos.')).toBeInTheDocument();
  act(()=>vi.advanceTimersByTime(2000));expect(screen.getByText('Ya podés reintentar')).toBeInTheDocument();
});
test('la búsqueda descarta respuestas de otro canal y pagina el historial',async()=>{
  vi.useFakeTimers();const old=deferred();mocks.get.mockReturnValueOnce(old.promise).mockResolvedValueOnce({items:[{id:2}],nextCursor:2}).mockResolvedValueOnce({items:[{id:1}],nextCursor:null});
  const {result,rerender}=renderHook(({id})=>useMessageSearch('channels',id,'aguja'),{initialProps:{id:1}});
  await act(async()=>vi.advanceTimersByTime(300));rerender({id:2});await act(async()=>vi.advanceTimersByTime(300));
  await act(async()=>old.resolve({items:[{id:99}],nextCursor:null}));expect(result.current.items).toEqual([{id:2}]);
  await act(async()=>result.current.more());expect(result.current.items).toEqual([{id:2},{id:1}]);expect(mocks.get).toHaveBeenLastCalledWith('/channels/2/messages/search?q=aguja&cursor=2');
});
test('la búsqueda corta y los errores no conservan resultados',async()=>{
  vi.useFakeTimers();mocks.get.mockRejectedValue(new Error('Acceso revocado'));
  const {result,rerender}=renderHook(({q})=>useMessageSearch('channels',1,q),{initialProps:{q:'hola'}});
  await act(async()=>vi.advanceTimersByTime(300));expect(result.current.error).toBe('Acceso revocado');expect(result.current.items).toEqual([]);
  rerender({q:'a'});expect(result.current.active).toBe(false);
});
test('compartidos tardíos no aparecen en otro destino',async()=>{
  const old=deferred();mocks.get.mockReturnValueOnce(old.promise);
  const {rerender}=render(<SharedFiles tipo="canal" id={1}/>);fireEvent.click(screen.getByText('Ver compartido'));
  rerender(<SharedFiles tipo="canal" id={2}/>);
  await act(async()=>old.resolve({items:[{id:1,adjunto:{id:2,nombre:'secreto.pdf'}}]}));expect(screen.queryByText('secreto.pdf')).not.toBeInTheDocument();
});
test('un canal de solo lectura muestra compartidos sin ofrecer adjuntar',()=>{
  render(<SharedFiles tipo="canal" id={1} canWrite={false}/>);expect(screen.queryByLabelText(/Adjuntar/)).not.toBeInTheDocument();expect(screen.getByText('Ver compartido')).toBeInTheDocument();
});
test('un archivo demasiado grande se rechaza antes de enviarlo',()=>{
  render(<SharedFiles tipo="canal" id={1}/>);const file=new File(['x'],'a.pdf',{type:'application/pdf'});Object.defineProperty(file,'size',{value:6*1024*1024});
  fireEvent.change(screen.getByLabelText(/Adjuntar/),{target:{files:[file]}});expect(screen.getByRole('alert')).toHaveTextContent('5 MB');expect(mocks.post).not.toHaveBeenCalled();
});
test('mencionar conserva el texto y permite elegir un integrante',()=>{
  const change=vi.fn();render(<MentionPicker value="Hola @an" onChange={change} members={[{usuario:{id:1,nombreUsuario:'ana',nombreVisible:'Ana'}}]}/>);
  fireEvent.click(screen.getByRole('button'));expect(change).toHaveBeenCalledWith('Hola @ana ');
});
test('transferir requiere confirmación y cancelar no llama al servidor',()=>{
  render(<OwnershipTransfer comunidad={{id:1,miRol:'PROPIETARIO'}} members={[{rol:'INTEGRANTE',usuario:{id:2,nombreVisible:'Ana',nombreUsuario:'ana'}}]} onDone={vi.fn()}/>);
  fireEvent.change(screen.getByLabelText('Nuevo propietario'),{target:{value:'2'}});fireEvent.click(screen.getByRole('button',{name:'Transferir propiedad'}));
  expect(screen.getByRole('dialog')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Cancelar'}));expect(mocks.post).not.toHaveBeenCalled();
});
test('un administrador no puede transferir desde el formulario',()=>{
  render(<OwnershipTransfer comunidad={{id:1,miRol:'ADMIN'}} members={[]} onDone={vi.fn()}/>);expect(screen.queryByText('Transferir propiedad')).not.toBeInTheDocument();
});
test('revocar acceso invalida la paginación de notificaciones que estaba pendiente',async()=>{
  const more=deferred(), initial={items:[{id:1,tipo:'canal',referencia:1,fechaCreacion:new Date().toISOString()}],noLeidas:1,nextCursor:1};
  mocks.get.mockResolvedValue(initial);
  render(<MemoryRouter><ActivityCenter/></MemoryRouter>);
  await waitFor(()=>expect(screen.getByLabelText('Notificaciones: 1 sin leer')).toBeInTheDocument());
  fireEvent.click(screen.getByLabelText('Notificaciones: 1 sin leer'));
  await screen.findByText('Cargar anteriores');
  mocks.get.mockReturnValueOnce(more.promise);fireEvent.click(screen.getByText('Cargar anteriores'));
  mocks.get.mockResolvedValue({items:[],noLeidas:0});
  await act(async()=>mocks.listeners.get('channel:access-lost')());
  await act(async()=>more.resolve({items:[{id:9,tipo:'canal',referencia:1,fechaCreacion:new Date().toISOString()}],noLeidas:1}));
  expect(screen.getByText('No tenés notificaciones')).toBeInTheDocument();expect(screen.queryByRole('button',{name:/Abrir canal/})).not.toBeInTheDocument();
});
test('un mensaje nuevo aparece como aviso flotante y se puede marcar como leído', async () => {
  const fecha = new Date().toISOString();
  mocks.get.mockResolvedValueOnce({ items: [], noLeidas: 0 });
  render(<MemoryRouter><ActivityCenter/></MemoryRouter>);
  await waitFor(() => expect(screen.getByLabelText('Notificaciones: 0 sin leer')).toBeInTheDocument());
  mocks.get.mockResolvedValue({ items: [{ id: 4, tipo: 'conversacion', referencia: 7, leida: false, fechaCreacion: fecha, contexto: { nombre: 'Cande Ríos' }, vista: { autor: 'Cande Ríos', texto: 'Mandame la foto' } }], noLeidas: 1 });
  await act(async () => mocks.listeners.get('notifications:changed')());
  expect(await screen.findByText('Mandame la foto')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Responder' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Marcar como leído' }));
  expect(mocks.post).toHaveBeenCalledWith('/notifications/read', { tipo: 'conversacion', referencia: 7 });
  expect(screen.queryByText('Mandame la foto')).not.toBeInTheDocument();
});
