import {fireEvent,render,screen} from '@testing-library/react';
import {expect,test,vi} from 'vitest';
import ChatMessage from '../components/chat/ChatMessage.jsx';
test('el registro de llamada no permite editar o borrar, sin confundir texto de usuario',()=>{
 const message={id:1,contenido:'Llamada de voz: finalizada.',fechaCreacion:'2026-11-21T12:00:00Z',registroLlamada:true};const props={own:true,first:true,connected:true,onEdit:vi.fn(),onDelete:vi.fn()};const view=render(<ul><ChatMessage {...props} mensaje={message}/></ul>);expect(screen.queryByRole('button',{name:/Editar mensaje/})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:/Eliminar mensaje/})).not.toBeInTheDocument();view.rerender(<ul><ChatMessage {...props} mensaje={{...message,registroLlamada:false}}/></ul>);fireEvent.click(screen.getByRole('button',{name:'Opciones del mensaje'}));expect(screen.getByRole('menuitem',{name:'Editar mensaje'})).toBeInTheDocument();
});
