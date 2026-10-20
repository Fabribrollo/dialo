import { beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import ChannelChat from '../components/channel-chat/ChannelChat.jsx';
import ChannelSelector from '../components/channels/ChannelSelector.jsx';
import { useChannelMessages } from '../hooks/useChannelMessages.js';
vi.mock('../hooks/useChannelMessages.js', () => ({ useChannelMessages: vi.fn() }));
vi.mock('../hooks/useAuth.js', () => ({ useAuth: () => ({ usuario: { id: 1, nombreVisible: 'Valen', nombreUsuario: 'valen' }, refresh: vi.fn() }) }));
const canal = { id: 4, idComunidad: 2, nombre: 'general', misPermisos: ['VER','ESCRIBIR'] };
const person = (id, nombreVisible) => ({ id, nombreVisible, nombreUsuario: nombreVisible.toLowerCase() });
const message = (id, autor, extra={}) => ({ id, idCanal:4, autor, contenido:`Texto ${id}`, fechaCreacion:'2026-10-20T10:00:00Z', eliminado:false, ...extra });
let state;
function View() { const [draft,setDraft]=useState('');return <ChannelChat canal={canal} draft={draft} setDraft={setDraft} />; }
const view=()=>render(<View />);
const own=()=>screen.getByText('Texto 1').closest('.message');
const other=()=>screen.getByText('Texto 2').closest('.message');
beforeEach(()=>{
 state={canal,ready:true,connected:true,loading:false,messages:[message(1,person(1,'Valen')),message(2,person(2,'Feli'))],members:[{usuario:person(1,'Valen'),rol:'PROPIETARIO'},{usuario:person(2,'Felipe'),rol:'INTEGRANTE'}],membersReady:true,cursor:null,error:'',memberError:'',reload:vi.fn(),older:vi.fn(),action:vi.fn().mockResolvedValue({})};
 useChannelMessages.mockImplementation(()=>state);
});
it('identifica varios autores con el perfil vigente, muestra fechas y edita solo lo propio',()=>{
 view();expect(screen.getByText('Felipe')).toBeInTheDocument();expect(screen.getByText('20 de octubre de 2026')).toBeInTheDocument();
 expect(within(own()).getByRole('button',{name:/Editar mensaje/})).toBeInTheDocument();
 expect(within(other()).queryByRole('button',{name:/Editar mensaje/})).not.toBeInTheDocument();
});
it.each([['PROPIETARIO','ADMIN',true],['ADMIN','PROPIETARIO',false],['ADMIN','ADMIN',false],['MODERADOR','INTEGRANTE',true],['MODERADOR','MODERADOR',false],['INTEGRANTE','INTEGRANTE',false]])('jerarquía %s frente a %s ofrece eliminación: %s',(self,target,allowed)=>{
 state.members[0].rol=self;state.members[1].rol=target;view();expect(Boolean(within(other()).queryByRole('button',{name:/Eliminar mensaje/}))).toBe(allowed);
});
it('autor que abandonó puede ser moderado, pero una lista de integrantes fallida no concede ese permiso',()=>{
 state.members.pop();const mounted=view();expect(within(other()).getByRole('button',{name:/Eliminar mensaje/})).toBeInTheDocument();
 state={...state,membersReady:false};mounted.rerender(<View/>);expect(within(other()).queryByRole('button',{name:/Eliminar mensaje/})).not.toBeInTheDocument();
});
it('solo lectura no ofrece acciones propias y permite moderación válida sin ESCRIBIR',()=>{
 state.canal={...canal,misPermisos:['VER']};view();expect(within(own()).queryByRole('button')).not.toBeInTheDocument();
 expect(within(other()).getByRole('button',{name:/Eliminar mensaje/})).toBeInTheDocument();expect(screen.getByLabelText('Mensaje en general')).toBeDisabled();expect(screen.getByRole('button',{name:'Enviar mensaje al canal'})).toBeDisabled();
});
it('eliminación moderada exige confirmar y cancelar devuelve el foco',async()=>{
 view();const button=within(other()).getByRole('button',{name:/Eliminar mensaje/});fireEvent.click(button);
 expect(screen.getByRole('dialog')).toHaveTextContent('todos los integrantes');expect(state.action).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Cancelar'}));expect(button).toHaveFocus();
 fireEvent.click(button);fireEvent.click(screen.getByRole('button',{name:'Eliminar mensaje',exact:true}));
 await waitFor(()=>expect(state.action).toHaveBeenCalledExactlyOnceWith('channel-message:delete',{idMensaje:2}));
});
it('un fallo de envío conserva el borrador y evita envíos repetidos',async()=>{
 let reject;state.action.mockReturnValueOnce(new Promise((_r,j)=>{reject=j;}));view();const input=screen.getByLabelText('Mensaje en general');
 fireEvent.change(input,{target:{value:'Pendiente'}});fireEvent.submit(input.closest('form'));fireEvent.submit(input.closest('form'));
 expect(state.action).toHaveBeenCalledTimes(1);await act(async()=>reject(new Error('No se pudo confirmar')));expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo confirmar');expect(input).toHaveValue('Pendiente');
});
it('no borra texto nuevo escrito mientras espera el ack',async()=>{
 let resolve;state.action.mockReturnValueOnce(new Promise(r=>{resolve=r;}));view();const input=screen.getByLabelText('Mensaje en general');
 fireEvent.change(input,{target:{value:'Uno'}});fireEvent.keyDown(input,{key:'Enter',shiftKey:true});expect(state.action).not.toHaveBeenCalled();fireEvent.keyDown(input,{key:'Enter'});
 fireEvent.change(input,{target:{value:'Dos'}});await act(async()=>resolve({}));expect(input).toHaveValue('Dos');
});
it('muestra el motivo de una eliminación y oculta contenido/controles',()=>{
 state.messages=[message(2,person(2,'Feli'),{eliminado:true,eliminadoPorModerador:true,contenido:'No debe verse'})];view();
 expect(screen.getByText('Mensaje eliminado por moderación')).toBeInTheDocument();expect(screen.queryByText('No debe verse')).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:/Editar mensaje|Eliminar mensaje/})).not.toBeInTheDocument();
});
it('pérdida de acceso retira el historial y el formulario',()=>{
 const mounted=view();state={...state,lost:true,error:'Sin acceso',messages:[]};mounted.rerender(<View/>);
 expect(screen.getByRole('alert')).toHaveTextContent('Sin acceso');expect(screen.queryByText('Texto 1')).not.toBeInTheDocument();expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});
it('los integrantes son consultables bajo demanda',()=>{
 view();expect(screen.queryByText('Integrantes de la comunidad')).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Integrantes'}));expect(screen.getByText('Integrantes de la comunidad')).toBeInTheDocument();fireEvent.keyDown(screen.getByRole('region',{name:'Chat de general'}),{key:'Escape'});expect(screen.queryByText('Integrantes de la comunidad')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'Integrantes'})).toHaveFocus();
});
it('la lista de canales se despliega en el catálogo y se contrae al abrir un canal',()=>{
 const mounted=render(<ChannelSelector><a href="#canal">general</a></ChannelSelector>);expect(screen.getByText('general')).toBeVisible();
 mounted.rerender(<ChannelSelector selected="4"><a href="#canal">general</a></ChannelSelector>);
 expect(screen.getByText('general')).not.toBeVisible();fireEvent.click(screen.getByText('Cambiar canal')); // jsdom no implementa toggle nativo; se comprueba el control semántico.
 expect(screen.getByText('Cambiar canal').tagName).toBe('SUMMARY');
});
it('reconectar no vuelve a abrir una confirmación invalidada por la desconexión',()=>{
 const mounted=view();fireEvent.click(within(other()).getByRole('button',{name:/Eliminar mensaje/}));expect(screen.getByRole('dialog')).toBeInTheDocument();
 state={...state,ready:false,connected:false,messages:[]};mounted.rerender(<View/>);expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
 state={...state,ready:true,connected:true,messages:[message(2,person(2,'Feli'))]};mounted.rerender(<View/>);expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
