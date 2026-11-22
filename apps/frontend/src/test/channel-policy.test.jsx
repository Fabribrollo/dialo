import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,expect,test,vi} from 'vitest';
import {MemoryRouter} from 'react-router';
import ChannelAccessForm from '../components/channels/ChannelAccessForm.jsx';
import ChannelRequests,{LockedChannel} from '../components/channels/ChannelRequests.jsx';
import CreateChannelWizard from '../components/channels/CreateChannelWizard.jsx';
import ChannelList from '../components/channels/ChannelList.jsx';
const m=vi.hoisted(()=>({getChannelAccess:vi.fn(),replaceChannelAccess:vi.fn(),getChannelRequests:vi.fn(),resolveChannelRequest:vi.fn(),requestChannelAccess:vi.fn(),createChannel:vi.fn(),suggestChannel:vi.fn(),members:vi.fn(),roles:vi.fn(),listeners:new Map(),on:vi.fn(),off:vi.fn()}));
vi.mock('../services/channelsService.js',()=>({...m}));
vi.mock('../services/communitiesService.js',()=>({getCommunityMembers:m.members}));
vi.mock('../services/communityRolesService.js',()=>({getCommunityRoles:m.roles}));
vi.mock('../hooks/useSocket.js',()=>({useSocket:()=>m}));
const ch={id:1,idComunidad:2,nombre:'Diseño',tipo:'TEXTO',privado:false};
const person={id:7,nombreVisible:'Ana',nombreUsuario:'ana'};
const options=()=>({canal:ch,version:0,onSaved:vi.fn(),onCancel:vi.fn(),onReload:vi.fn(),onUnavailable:vi.fn()});
beforeEach(()=>{
  vi.clearAllMocks();m.roles.mockResolvedValue({items:[]});m.listeners.clear();m.on.mockImplementation((name,fn)=>m.listeners.set(name,fn));
  m.getChannelAccess.mockResolvedValue({acceso:{privado:false,permisosGlobales:['VER','ESCRIBIR'],habilitaciones:[]}});
  m.members.mockResolvedValue({items:[{usuario:person,rol:'INTEGRANTE'}]});m.replaceChannelAccess.mockResolvedValue({});
  m.getChannelRequests.mockResolvedValue({items:[]});m.requestChannelAccess.mockResolvedValue({solicitud:{estado:'PENDIENTE'}});m.resolveChannelRequest.mockResolvedValue({});
});
test('públicos configuran globales sin VER ni excepciones de roles o personas',async()=>{
  render(<ChannelAccessForm {...options()}/>);
  const write=await screen.findByLabelText('Permisos globales: Escribir');expect(write).toBeChecked();
  expect(screen.queryByLabelText('Integrante a habilitar')).not.toBeInTheDocument();expect(screen.queryByLabelText('Rol a configurar')).not.toBeInTheDocument();expect(screen.queryByLabelText('Permisos globales: Ver')).not.toBeInTheDocument();expect(screen.queryByText('Moderador')).not.toBeInTheDocument();
  fireEvent.click(write);fireEvent.click(screen.getByRole('button',{name:'Guardar permisos'}));
  await waitFor(()=>expect(m.replaceChannelAccess).toHaveBeenCalledWith(1,{privado:false,permisosGlobales:[]}));
});
test('privados permiten habilitaciones individuales y por rol sin globales',async()=>{
  m.getChannelAccess.mockResolvedValue({acceso:{privado:true,permisosGlobales:[],habilitaciones:[]}});
  render(<ChannelAccessForm {...options()} canal={{...ch,privado:true}}/>);
  fireEvent.change(await screen.findByLabelText('Integrante a habilitar'),{target:{value:'7'}});fireEvent.click(screen.getByText('Agregar integrante'));
  expect(screen.queryByLabelText('Permisos globales: Ver')).not.toBeInTheDocument();expect(screen.queryByText('Roles')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Guardar permisos'));
  await waitFor(()=>expect(m.replaceChannelAccess).toHaveBeenCalledWith(1,{privado:true,habilitaciones:[{idUsuario:7,permisos:['VER','ESCRIBIR']}]}));
});
test('quitar una persona privada revoca su habilitación sin añadir roles',async()=>{
  m.getChannelAccess.mockResolvedValue({acceso:{privado:true,habilitaciones:[{usuario:person,permisos:['VER']}]}});
  render(<ChannelAccessForm {...options()} canal={{...ch,privado:true}}/>);fireEvent.click(await screen.findByRole('button',{name:'Retirar acceso'}));fireEvent.click(screen.getByText('Guardar permisos'));
  await waitFor(()=>expect(m.replaceChannelAccess).toHaveBeenCalledWith(1,{privado:true,habilitaciones:[]}));
});
test('el catálogo muestra el canal bloqueado sin texto de mensajes',()=>{
  render(<MemoryRouter><ChannelList items={[{...ch,bloqueado:true,privado:true}]} base="/comunidades/2/canales"/></MemoryRouter>);
  expect(screen.getByText(/Bloqueado/)).toBeInTheDocument();expect(screen.getByRole('link')).toHaveAttribute('href','/comunidades/2/canales/1');
});
test('canal privado bloqueado solicita acceso, muestra error y conserva opción de reintento',async()=>{
  const changed=vi.fn();m.requestChannelAccess.mockRejectedValueOnce(new Error('Sin conexión'));
  render(<LockedChannel canal={{...ch,privado:true}} onChanged={changed}/>);
  fireEvent.click(screen.getByText('Solicitar acceso'));expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión');
  fireEvent.click(screen.getByText('Solicitar acceso'));await waitFor(()=>expect(changed).toHaveBeenCalledTimes(1));
});
test('solicitud pendiente no permite repetir y público bloqueado no ofrece solicitudes',()=>{
  const {rerender}=render(<LockedChannel canal={{...ch,privado:true,solicitud:'PENDIENTE'}} onChanged={vi.fn()}/>);
  expect(screen.getByText('Solicitud pendiente')).toBeDisabled();rerender(<LockedChannel canal={ch} onChanged={vi.fn()}/>);
  expect(screen.queryByText('Solicitar acceso')).not.toBeInTheDocument();
});
test('administración acepta el pedido con los permisos elegidos',async()=>{
  m.getChannelRequests.mockResolvedValue({items:[{id:4,membresia:{usuario:person}}]});
  render(<ChannelRequests canal={{...ch,privado:true}} onChanged={vi.fn()} onCancel={vi.fn()}/>);
  fireEvent.click(await screen.findByLabelText('Permisos de Ana: Escribir'));fireEvent.click(screen.getByText('Aceptar acceso'));
  await waitFor(()=>expect(m.resolveChannelRequest).toHaveBeenCalledWith(1,4,{aceptar:true,permisos:['VER','ESCRIBIR']}));
});
test('rechazar no concede permisos y conserva el pedido si el servidor falla',async()=>{
  m.getChannelRequests.mockResolvedValue({items:[{id:4,membresia:{usuario:person}}]});m.getChannelRequests.mockResolvedValueOnce({items:[{id:4,membresia:{usuario:person}}]}).mockResolvedValue({items:[]});m.resolveChannelRequest.mockRejectedValue(Object.assign(new Error('La solicitud ya fue resuelta'),{status:409}));
  render(<ChannelRequests canal={ch} onChanged={vi.fn()} onCancel={vi.fn()}/>);fireEvent.click(await screen.findByText('Rechazar'));
  expect(await screen.findByRole('alert')).toHaveTextContent('ya fue resuelta');expect(m.resolveChannelRequest).toHaveBeenCalledWith(1,4,{aceptar:false});expect(screen.getByText('No hay solicitudes pendientes')).toBeInTheDocument();
});
test('reconexión recupera pedidos pendientes',async()=>{
  render(<ChannelRequests canal={ch} onChanged={vi.fn()} onCancel={vi.fn()}/>);await screen.findByText('No hay solicitudes pendientes');
  m.getChannelRequests.mockResolvedValue({items:[{id:4,membresia:{usuario:person}}]});
  await act(async()=>m.listeners.get('connect')());expect(await screen.findByText('Ana')).toBeInTheDocument();
});
test('crear público guarda permisos globales en la misma operación y no agrega personas',async()=>{
  m.createChannel.mockResolvedValue({canal:{...ch,id:5}});
  render(<CreateChannelWizard idComunidad={2} onCreated={vi.fn()} onCancel={vi.fn()} onOpen={vi.fn()}/>);
  fireEvent.click(screen.getByText('Siguiente'));fireEvent.click(screen.getByRole('radio',{name:/Lo armo yo/}));fireEvent.click(screen.getByText('Siguiente'));
  fireEvent.change(screen.getByLabelText('Nombre'),{target:{value:'Solo lectura'}});fireEvent.click(screen.getByText('Siguiente'));
  fireEvent.click(screen.getByLabelText('Permisos globales: Escribir'));fireEvent.click(screen.getByText('Crear canal'));
  await waitFor(()=>expect(m.createChannel).toHaveBeenCalledWith(2,{nombre:'Solo lectura',tipo:'TEXTO',privado:false,permisosGlobales:[]}));
  expect(m.replaceChannelAccess).not.toHaveBeenCalled();
});

test('permisos privados no permiten cambiar privacidad ni duplican el acceso a Solicitudes',async()=>{
  m.getChannelAccess.mockResolvedValue({acceso:{privado:true,habilitaciones:[]}});
  render(<ChannelAccessForm {...options()} canal={{...ch,privado:true}} onRequests={vi.fn()}/>);
  await screen.findByLabelText('Integrante a habilitar');
  expect(screen.queryByLabelText('Canal privado')).not.toBeInTheDocument();
  expect(screen.queryByText('Gestionar solicitudes')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Guardar permisos'));
  await waitFor(()=>expect(m.replaceChannelAccess).toHaveBeenCalledWith(1,{privado:true,habilitaciones:[]}));
});
test('permisos públicos no muestran un control para convertir el canal',async()=>{
  render(<ChannelAccessForm {...options()}/>);await screen.findByLabelText('Permisos globales: Escribir');
  expect(screen.queryByLabelText('Canal privado')).not.toBeInTheDocument();
});

test('los roles se heredan sin volver a configurarlos en el canal',async()=>{
 render(<ChannelAccessForm {...options()}/>);await screen.findByLabelText('Permisos globales: Escribir');
 expect(screen.getByText(/roles personalizados siempre suman/)).toBeInTheDocument();
 expect(m.roles).not.toHaveBeenCalled();expect(screen.queryByLabelText('Rol a configurar')).not.toBeInTheDocument();
});
test('voz separa cámara, pantalla y acciones especiales sin permitir banear',async()=>{
 render(<ChannelAccessForm {...options()} canal={{...ch,tipo:'VOZ'}}/>);
 expect(await screen.findByLabelText('Permisos globales: Activar cámara')).not.toBeChecked();
 expect(screen.getByLabelText('Permisos globales: Compartir pantalla')).not.toBeChecked();
 expect(screen.getByLabelText('Permisos globales: Silenciar usuarios')).toBeInTheDocument();
 expect(screen.queryByLabelText(/Banear/)).not.toBeInTheDocument();expect(screen.queryByLabelText('Permisos globales: Ver')).not.toBeInTheDocument();
});

test('el último paso de un privado explica el acceso dentro del modal sin un popup informativo',async()=>{
 render(<CreateChannelWizard idComunidad={2} onCreated={vi.fn()} onCancel={vi.fn()} onOpen={vi.fn()}/>);
 fireEvent.click(screen.getByText('Siguiente'));fireEvent.click(screen.getByRole('radio',{name:/Lo armo yo/}));fireEvent.click(screen.getByText('Siguiente'));
 fireEvent.change(screen.getByLabelText('Nombre'),{target:{value:'Privado'}});fireEvent.click(screen.getByRole('switch',{name:'Canal privado'}));fireEvent.click(screen.getByText('Siguiente'));
 const heading=screen.getByRole('heading',{name:'Acceso por solicitud'});expect(heading.closest('.ccw-step-body')).toBeInTheDocument();expect(screen.getByText(/Solo el propietario y los administradores tienen acceso inicial/)).toBeInTheDocument();expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
