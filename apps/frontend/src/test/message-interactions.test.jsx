import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {expect,test,vi} from 'vitest';
import {SocketContext} from '../context/SocketContext.jsx';
import {act} from '@testing-library/react';
import {useState} from 'react';
import ChatMessage from '../components/chat/ChatMessage.jsx';
import Composer from '../components/chat/Composer.jsx';
import {MessageInteractionContext,useMessageInteractions,PinnedMessages} from '../components/chat/MessageInteractions.jsx';
import {mergeMessages} from '../utils/chat.js';
const messages=[{id:1,idAutor:1,contenido:'Texto propio',fechaCreacion:'2026-11-22T12:00:00Z',fechaFijado:null,reacciones:[]},{id:2,idAutor:2,contenido:'Texto ajeno',fechaCreacion:'2026-11-22T12:01:00Z',fechaFijado:null,reacciones:[]}];
function Fixture({items=messages,action=vi.fn().mockResolvedValue({}),canWrite=true,canPin=true,connected=true,loadOlder,hasOlder=false}){
 const [text,setText]=useState('');const interactions=useMessageInteractions({id:7,event:'message:interact',action,messages:items,usuario:{id:1},connected,canWrite,canPin,inputId:'compose',otherName:'Dani',loadOlder,hasOlder});
 return <MessageInteractionContext.Provider value={interactions}><PinnedMessages/><ul>{items.map(m=><ChatMessage key={m.id} mensaje={m} own={m.idAutor===1} connected={connected} onEdit={m.idAutor===1?vi.fn():undefined} onDelete={m.idAutor===1?vi.fn():undefined}/>)}</ul><Composer id="compose" label="Mensaje" value={text} onChange={setText} onSend={()=>action('send',{text,idRespuesta:interactions.reply?.id})} canSend={Boolean(text)} /></MessageInteractionContext.Provider>;
}
const menu=(index=0)=>{fireEvent.click(screen.getAllByRole('button',{name:'Opciones del mensaje'})[index]);return within(screen.getByRole('menu',{name:'Acciones del mensaje'}));};
test('solo abre un menú y Escape devuelve foco; fuera del menú lo cierra',()=>{
 render(<Fixture/>);expect(screen.queryByRole('menu')).not.toBeInTheDocument();menu();expect(screen.getByRole('menuitem',{name:'Editar mensaje'})).toBeInTheDocument();menu(1);expect(screen.getAllByRole('menu')).toHaveLength(1);expect(screen.queryByRole('menuitem',{name:'Editar mensaje'})).not.toBeInTheDocument();fireEvent.keyDown(document,{key:'Escape'});expect(screen.queryByRole('menu')).not.toBeInTheDocument();expect(screen.getAllByRole('button',{name:'Opciones del mensaje'})[1]).toHaveFocus();menu();fireEvent.pointerDown(document.body);expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});
test('responder cita al autor en el compositor, envía la referencia y se puede cancelar',async()=>{
 const action=vi.fn().mockResolvedValue({});render(<Fixture action={action}/>);fireEvent.click(menu(1).getByRole('menuitem',{name:'Responder'}));expect(screen.getByRole('status')).toHaveTextContent('Respondiendo a Dani');await waitFor(()=>expect(screen.getByRole('textbox',{name:'Mensaje'})).toHaveFocus());fireEvent.change(screen.getByRole('textbox'),{target:{value:'De acuerdo'}});fireEvent.click(screen.getByRole('button',{name:'Enviar mensaje'}));expect(action).toHaveBeenCalledWith('send',{text:'De acuerdo',idRespuesta:2});fireEvent.click(screen.getByRole('button',{name:'Cancelar respuesta'}));expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
test('reaccionar usa el servidor, la reacción propia se retira y un fallo conserva el estado',async()=>{
 const action=vi.fn().mockResolvedValue({});const items=[{...messages[0],reacciones:[{emoji:'👍',usuarios:[1,2]}]}];render(<Fixture items={items} action={action}/>);fireEvent.click(screen.getByRole('button',{name:'👍: 2 reacciones'}));expect(action).toHaveBeenCalledWith('message:interact',{accion:'reaccionar',idMensaje:1,emoji:null});fireEvent.click(menu().getByRole('menuitem',{name:'Reaccionar ❤️'}));await waitFor(()=>expect(action).toHaveBeenCalledWith('message:interact',{accion:'reaccionar',idMensaje:1,emoji:'❤️'}));expect(screen.getByRole('button',{name:'👍: 2 reacciones'})).toHaveAttribute('aria-pressed','true');
});
test('sin escritura no ofrece responder ni reaccionar y sin gestión no ofrece fijar',()=>{
 render(<Fixture canWrite={false} canPin={false}/>);const options=menu(1);expect(options.queryByRole('menuitem',{name:'Responder'})).not.toBeInTheDocument();expect(options.queryByRole('group',{name:'Reaccionar'})).not.toBeInTheDocument();expect(options.queryByRole('menuitem',{name:'Fijar mensaje'})).not.toBeInTheDocument();expect(options.getByRole('menuitem',{name:'Copiar texto'})).toBeInTheDocument();
});
test('fijados antiguos se muestran en la barra sin modal ni controles de desfijar',async()=>{
 const pinned={...messages[1],id:88,fechaFijado:'2026-11-22T12:01:00Z',contenido:'Referencia antigua'},action=vi.fn().mockResolvedValue({items:[pinned]}),socket={on:vi.fn(),off:vi.fn()};render(<SocketContext.Provider value={socket}><Fixture action={action}/></SocketContext.Provider>);const bar=await screen.findByRole('button',{name:'Ir al mensaje fijado'});expect(bar).toHaveTextContent('Referencia antigua');expect(screen.queryByRole('button',{name:'Mensajes fijados'})).not.toBeInTheDocument();expect(screen.queryByRole('dialog',{name:'Mensajes fijados'})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Desfijar'})).not.toBeInTheDocument();
});
test('copiar usa el portapapeles y los adjuntos siguen sin poder editarse',async()=>{
 const writeText=vi.fn().mockResolvedValue();Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}});const item={...messages[0],adjunto:{id:9,nombre:'foto.png',tipo:'image/png'}};render(<Fixture items={[item]}/>);const options=menu();expect(options.queryByRole('menuitem',{name:'Editar mensaje'})).not.toBeInTheDocument();expect(options.getByRole('menuitem',{name:'Eliminar recurso'})).toBeInTheDocument();fireEvent.click(options.getByRole('menuitem',{name:'Copiar texto'}));await waitFor(()=>expect(writeText).toHaveBeenCalledWith('Texto propio'));
});
test('cita viva oculta texto eliminado y las actualizaciones limpian reacciones y fijados',()=>{
 const reply={...messages[1],respuesta:{id:1,autor:'Ana',contenido:'Texto propio'}};const view=render(<Fixture items={[messages[0],reply]}/>);expect(document.querySelector('.message-quote')).toHaveTextContent('Texto propio');view.rerender(<Fixture items={[{...messages[0],eliminado:true,contenido:null},reply]}/>);expect(document.querySelector('.message-quote')).toHaveTextContent('Mensaje eliminado');expect(document.querySelector('.message-quote')).not.toHaveTextContent('Texto propio');const merged=mergeMessages([{...messages[0],fechaFijado:'2026-11-22T12:00:00Z',reacciones:[{emoji:'👍',usuarios:[1]}]}],[messages[0]]);expect(merged[0].fechaFijado).toBe(null);expect(merged[0].reacciones).toEqual([]);
});
test('sin conexión las acciones remotas quedan deshabilitadas',()=>{
 render(<Fixture connected={false}/>);const options=menu();expect(options.getByRole('menuitem',{name:'Responder'})).toBeDisabled();expect(options.getByRole('menuitem',{name:'Fijar mensaje'})).toBeDisabled();expect(options.getByRole('menuitem',{name:'Editar mensaje'})).toBeDisabled();expect(options.getByRole('menuitem',{name:'Copiar texto'})).not.toBeDisabled();
});

test('cita, texto, reacciones y hora comparten una única burbuja',()=>{
 const m={...messages[0],respuesta:{id:2,autor:'Dani',contenido:'Texto ajeno'},reacciones:[{emoji:'❤️',usuarios:[1]}]};render(<Fixture items={[m]}/>);const bubble=screen.getByText('Texto propio').closest('.message-bubble');expect(within(bubble).getByText('Texto ajeno')).toBeInTheDocument();expect(within(bubble).getByRole('button',{name:'❤️: 1 reacciones'})).toBeInTheDocument();expect(bubble.querySelectorAll('time')).toHaveLength(1);expect(bubble.querySelector('.bubble-footer')).toContainElement(within(bubble).getByRole('button',{name:'❤️: 1 reacciones'}));
});
test('la barra compacta no aparece sin fijados y se actualiza por eventos sin recargar al escribir',async()=>{
 const handlers=new Map(),socket={on:vi.fn((name,fn)=>handlers.set(name,fn)),off:vi.fn()},action=vi.fn().mockResolvedValue({items:[]});render(<SocketContext.Provider value={socket}><Fixture action={action}/></SocketContext.Provider>);await waitFor(()=>expect(action).toHaveBeenCalledTimes(1));expect(screen.queryByLabelText('Barra de mensajes fijados')).not.toBeInTheDocument();
 const pin={...messages[1],id:88,idConversacion:7,fechaFijado:'2026-11-22T14:00:00Z',contenido:'Aviso fijado remoto'};act(()=>handlers.get('message:updated')({mensaje:pin}));expect(screen.getByRole('button',{name:'Ir al mensaje fijado'})).toHaveTextContent('Aviso fijado remoto');fireEvent.change(screen.getByRole('textbox'),{target:{value:'Texto nuevo'}});expect(action).toHaveBeenCalledTimes(1);act(()=>handlers.get('message:deleted')({idConversacion:7,idMensaje:88}));expect(screen.queryByLabelText('Barra de mensajes fijados')).not.toBeInTheDocument();
});
test('varios fijados se recorren sin mezclar el listado con el historial',()=>{
 const pins=messages.map((m,i)=>({...m,fechaFijado:`2026-11-22T1${i}:00:00Z`}));render(<Fixture items={pins}/>);expect(screen.getByRole('button',{name:'Ir al mensaje fijado'})).toHaveTextContent('1 de 2');expect(screen.getByRole('button',{name:'Ir al mensaje fijado'})).toHaveTextContent('Texto ajeno');fireEvent.click(screen.getByRole('button',{name:'Ir al mensaje fijado'}));expect(screen.getByRole('button',{name:'Ir al mensaje fijado'})).toHaveTextContent('Texto propio');
});
test('pulsar un fijado cargado lo localiza y devuelve el foco al mensaje',async()=>{
 const scroll=vi.fn();Element.prototype.scrollIntoView=scroll;render(<Fixture items={[{...messages[0],fechaFijado:'2026-11-22T12:00:00Z'}]}/>);fireEvent.click(screen.getByRole('button',{name:'Ir al mensaje fijado'}));await waitFor(()=>expect(scroll).toHaveBeenCalled());expect(document.querySelector('[data-message-id="1"]')).toHaveFocus();
});

test('la consulta de fijados prevalece sobre una página de historial anterior',async()=>{
 const pinned={...messages[0],fechaFijado:'2026-11-22T15:00:00Z'},action=vi.fn().mockResolvedValue({items:[pinned]}),socket={on:vi.fn(),off:vi.fn()};render(<SocketContext.Provider value={socket}><Fixture items={messages} action={action}/></SocketContext.Provider>);expect(await screen.findByRole('button',{name:'Ir al mensaje fijado'})).toHaveTextContent('Texto propio');expect(screen.getByLabelText('Barra de mensajes fijados')).toBeInTheDocument();
});
test('localizar un fijado antiguo carga la página necesaria antes de enfocarlo',async()=>{
 const pin={...messages[0],id:88,fechaFijado:'2026-11-22T15:00:00Z',contenido:'Fijado antiguo'},action=vi.fn().mockResolvedValue({items:[pin]}),socket={on:vi.fn(),off:vi.fn()},load=vi.fn();
 function Paged(){const [items,setItems]=useState([messages[1]]);return <SocketContext.Provider value={socket}><Fixture items={items} action={action} hasOlder={items.length===1} loadOlder={async()=>{load();setItems([pin,...items]);}}/></SocketContext.Provider>;}
 render(<Paged/>);fireEvent.click(await screen.findByRole('button',{name:'Ir al mensaje fijado'}));await waitFor(()=>expect(document.querySelector('[data-message-id="88"]')).toHaveFocus());expect(load).toHaveBeenCalledTimes(1);
});
