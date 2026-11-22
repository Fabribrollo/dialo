import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,expect,test,vi} from 'vitest';import {MemoryRouter} from 'react-router';
import Sidebar from '../components/shell/Sidebar.jsx';
const m=vi.hoisted(()=>({change:vi.fn(),reload:vi.fn(),leave:vi.fn(),forget:vi.fn(),states:{},owner:false}));
vi.mock('../hooks/useAuth.js',()=>({useAuth:()=>({usuario:{id:1,nombreVisible:'Ana'}})}));
vi.mock('../hooks/useSocket.js',()=>({useSocket:()=>null}));
vi.mock('../hooks/useFriends.js',()=>({useFriends:()=>({recibidas:[]})}));
vi.mock('../services/api.js',()=>({api:{get:async()=>({items:[],noLeidas:0})}}));
vi.mock('../services/communitiesService.js',()=>({leaveCommunity:m.leave}));
vi.mock('../context/ChatStateContext.jsx',()=>({useChatStates:()=>({change:m.change,reload:m.reload,get:(type,id)=>m.states[type+':'+id]??{archivado:false,oculto:false,noLeidos:0}})}));
vi.mock('../context/ConversationsContext.jsx',()=>({useConversations:()=>({items:[{id:7,otroUsuario:{nombreVisible:'Dani',nombreUsuario:'dani'}}],reload:m.reload,connected:true})}));
vi.mock('../context/CommunitiesContext.jsx',()=>({useCommunities:()=>({items:[{id:3,nombre:'Club',miRol:m.owner?'PROPIETARIO':'INTEGRANTE'}],forget:m.forget})}));
beforeEach(()=>{vi.clearAllMocks();m.states={};m.owner=false;m.change.mockResolvedValue();m.leave.mockResolvedValue();});
const show=()=>render(<MemoryRouter initialEntries={['/conversaciones/7']}><Sidebar/></MemoryRouter>);
const menu=name=>fireEvent.click(screen.getByLabelText('Opciones de '+name));
test('archivar una conversación guarda el silencio por cuenta y permite volver a verla en Archivados',async()=>{
 show();menu('Dani');fireEvent.click(screen.getAllByRole('menuitem',{name:'Archivar chat'})[0]);await waitFor(()=>expect(m.change).toHaveBeenCalledWith('conversacion',7,{archivado:true}));expect(m.leave).not.toHaveBeenCalled();
});
test('eliminar un privado explica que conserva amistad e historial y solo oculta la fila',async()=>{
 show();menu('Dani');fireEvent.click(screen.getByRole('menuitem',{name:'Eliminar conversación'}));expect(screen.getByRole('dialog')).toHaveTextContent('La amistad y los mensajes se conservan');fireEvent.click(screen.getByRole('button',{name:'Eliminar',exact:true}));await waitFor(()=>expect(m.change).toHaveBeenCalledWith('conversacion',7,{oculto:true}));expect(m.leave).not.toHaveBeenCalled();
});
test('quitar una comunidad usa salir; el propietario debe transferir antes',async()=>{
 const mounted=show();menu('Club');fireEvent.click(screen.getByRole('menuitem',{name:'Salir y quitar comunidad'}));fireEvent.click(screen.getByRole('button',{name:'Salir',exact:true}));await waitFor(()=>expect(m.leave).toHaveBeenCalledWith(3));
 mounted.unmount();m.owner=true;show();menu('Club');expect(screen.getByRole('menuitem',{name:'Salir y quitar comunidad'})).toBeDisabled();
});
test('archivados oculta la fila normal, indica nuevos mensajes y no duplica agregar amigos',()=>{
 m.states={'conversacion:7':{archivado:true,oculto:false,noLeidos:3}};show();expect(screen.queryByText('Dani')).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:/Chats archivados/}));expect(screen.getByText('Dani')).toBeInTheDocument();expect(screen.getByText('3')).toBeInTheDocument();expect(screen.queryByLabelText(/Agregar amigos/)).not.toBeInTheDocument();
});

test('solo hay un menú abierto y Escape devuelve el foco al disparador',()=>{
 show();menu('Dani');expect(screen.getAllByRole('menu')).toHaveLength(1);menu('Club');expect(screen.getAllByRole('menu')).toHaveLength(1);expect(screen.getByRole('menu')).toHaveAccessibleName('Acciones de Club');fireEvent.keyDown(document,{key:'Escape'});expect(screen.queryByRole('menu')).not.toBeInTheDocument();expect(screen.getByLabelText('Opciones de Club')).toHaveFocus();
});
test('sin destinos archivados no aparece el apartado y un clic afuera cierra el menú',()=>{
 show();expect(screen.queryByRole('button',{name:/Chats archivados/})).not.toBeInTheDocument();menu('Dani');fireEvent.pointerDown(document.body);expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});
