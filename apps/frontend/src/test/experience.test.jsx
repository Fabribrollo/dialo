import {act,fireEvent,render,renderHook,screen,waitFor} from '@testing-library/react';
import {expect,test,vi} from 'vitest';
import {createMemoryRouter,RouterProvider,Link} from 'react-router';
import {DraftsProvider,useDraftMap} from '../context/DraftsContext.jsx';
import {UnsavedChangesProvider,useUnsavedChanges} from '../context/UnsavedChangesContext.jsx';
import {useChatReading} from '../hooks/useChatReading.js';
import Segmented from '../components/ui/Segmented.jsx';
import {MediaGalleryProvider} from '../components/chat/MediaGallery.jsx';
import AttachmentCard from '../components/chat/AttachmentCard.jsx';
vi.mock('../hooks/useSocket.js',()=>({useSocket:()=>null}));
function Draft({id}){const [drafts,setDrafts]=useDraftMap('conversacion');return <input aria-label="Borrador" value={drafts[id]??''} onChange={e=>setDrafts(old=>({...old,[id]:e.target.value}))}/>;}
test('los borradores sobreviven al cambiar de vista, se separan por chat y se limpian al terminar la sesión',()=>{
 const view=render(<DraftsProvider><Draft id={1}/></DraftsProvider>);fireEvent.change(screen.getByLabelText('Borrador'),{target:{value:'Para uno'}});view.rerender(<DraftsProvider><Draft key="2" id={2}/></DraftsProvider>);expect(screen.getByLabelText('Borrador')).toHaveValue('');fireEvent.change(screen.getByLabelText('Borrador'),{target:{value:'Para dos'}});view.rerender(<DraftsProvider><Draft key="1" id={1}/></DraftsProvider>);expect(screen.getByLabelText('Borrador')).toHaveValue('Para uno');view.unmount();render(<DraftsProvider><Draft id={1}/></DraftsProvider>);expect(screen.getByLabelText('Borrador')).toHaveValue('');
});
test('al leer arriba cuenta solo mensajes nuevos ajenos, ignora paginación y volver al final restablece lectura',()=>{
 const stick={current:false},node=document.createElement('div'),viewport={current:node};Object.defineProperties(node,{scrollHeight:{value:1000},clientHeight:{value:300}});const initial=[{id:10,idAutor:2}];const {result,rerender}=renderHook(({messages})=>useChatReading(messages,viewport,stick,1),{initialProps:{messages:initial}});act(()=>result.current.onScroll({currentTarget:node}));rerender({messages:[{id:1,idAutor:2},...initial,{id:11,idAutor:1},{id:12,idAutor:2}]});expect(result.current.count).toBe(1);expect(result.current.firstUnread).toBe(12);expect(result.current.away).toBe(true);rerender({messages:[...initial,{id:12,idAutor:2,eliminado:true}]});expect(result.current.count).toBe(0);viewport.current=null;act(()=>result.current.toLatest());expect(result.current.count).toBe(0);expect(stick.current).toBe(true);
});
test('las pestañas admiten flechas, Home y End sin enfocar todas con Tab',()=>{
 const change=vi.fn();render(<Segmented options={[{value:'a',label:'Uno'},{value:'b',label:'Dos'}]} value="a" onChange={change} label="Pestañas"/>);expect(screen.getByRole('tab',{name:'Dos'})).toHaveAttribute('tabindex','-1');fireEvent.keyDown(screen.getByRole('tab',{name:'Uno'}),{key:'ArrowRight'});expect(change).toHaveBeenLastCalledWith('b');expect(screen.getByRole('tab',{name:'Dos'})).toHaveFocus();fireEvent.keyDown(screen.getByRole('tab',{name:'Dos'}),{key:'Home'});expect(change).toHaveBeenLastCalledWith('a');
});
function Form(){const {markSaved}=useUnsavedChanges(true,'Prueba','editado');return <><h1>Formulario</h1><Link to="/destino">Salir del formulario</Link><button onClick={markSaved}>Guardar</button></>;}
function routerFor(){return createMemoryRouter([{element:<UnsavedChangesProvider><Form/></UnsavedChangesProvider>,path:'/'},{path:'/destino',element:<h1>Destino</h1>}]);}
test('navegación con cambios permite quedarse o descartar, y guardar deja continuar',async()=>{
 const router=routerFor();const view=render(<RouterProvider router={router}/>);fireEvent.click(screen.getByRole('link'));expect(await screen.findByRole('dialog',{name:'¿Descartar los cambios sin guardar?'})).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Cancelar'}));expect(screen.getByRole('heading',{name:'Formulario'})).toBeInTheDocument();fireEvent.click(screen.getByRole('link'));fireEvent.click(await screen.findByRole('button',{name:'Descartar y salir'}));expect(await screen.findByRole('heading',{name:'Destino'})).toBeInTheDocument();view.unmount();render(<RouterProvider router={routerFor()}/>);fireEvent.click(screen.getByRole('button',{name:'Guardar'}));fireEvent.click(screen.getByRole('link'));expect(await screen.findByRole('heading',{name:'Destino'})).toBeInTheDocument();
});
test('la galería navega por recursos cargados y cierra si pierde el recurso activo',()=>{
 const messages=[1,2].map(id=>({id,adjunto:{id,tipo:'image/png',nombre:`foto${id}.png`}}));const show=items=><MediaGalleryProvider messages={items}>{items.map(m=><AttachmentCard key={m.id} file={m.adjunto}/>)}</MediaGalleryProvider>;const view=render(show(messages));fireEvent.click(screen.getByRole('button',{name:'Abrir foto1.png'}));expect(screen.getByRole('dialog',{name:'foto1.png'})).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Recurso siguiente'}));expect(screen.getByRole('dialog',{name:'foto2.png'})).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Ampliar imagen'}));expect(screen.getByRole('button',{name:'Ajustar imagen'})).toBeInTheDocument();view.rerender(show([messages[0]]));expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
test('beforeunload advierte mientras el formulario está sucio y deja de hacerlo al guardar',()=>{
 render(<RouterProvider router={routerFor()}/>);const first=new Event('beforeunload',{cancelable:true});act(()=>window.dispatchEvent(first));expect(first.defaultPrevented).toBe(true);fireEvent.click(screen.getByRole('button',{name:'Guardar'}));const second=new Event('beforeunload',{cancelable:true});act(()=>window.dispatchEvent(second));expect(second.defaultPrevented).toBe(false);
});
test('el límite de borradores conserva el chat que se está escribiendo aunque tenga un ID antiguo',()=>{
 const {result}=renderHook(()=>useDraftMap('conversacion'),{wrapper:DraftsProvider});act(()=>result.current[1](Object.fromEntries(Array.from({length:50},(_,i)=>[100+i,`Texto ${i}`]))));act(()=>result.current[1](old=>({...old,1:'Chat anterior'})));expect(result.current[0][1]).toBe('Chat anterior');expect(Object.keys(result.current[0])).toHaveLength(50);
});
