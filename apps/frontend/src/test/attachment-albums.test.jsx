import {fireEvent,render,screen,within} from '@testing-library/react';
import {expect,test,vi} from 'vitest';
import {groupAttachmentMessages} from '../utils/attachmentAlbums.js';
import AttachmentAlbum from '../components/chat/AttachmentAlbum.jsx';
import ChatMessage from '../components/chat/ChatMessage.jsx';
import {MediaGalleryProvider} from '../components/chat/MediaGallery.jsx';
const group='fcde2b44-59a3-4ea7-9d9b-038bcb3ea034';
const message=(id,extra={})=>({id,idAutor:1,idConversacion:3,contenido:id===1?'Las fotos':'Archivo adjunto',fechaCreacion:'2026-11-22T12:00:00Z',adjunto:{id,nombre:`foto${id}.png`,tipo:'image/png'},grupoAdjuntos:{id:group,total:6},...extra});
test('agrupa una tanda de seis, conserva el texto y no mezcla otro envío ni mensajes sueltos',()=>{
 const items=[...Array.from({length:6},(_,i)=>message(i+1)),message(7,{grupoAdjuntos:undefined}),message(8,{grupoAdjuntos:{id:'otro',total:4}})];const rows=groupAttachmentMessages(items);expect(rows).toHaveLength(3);expect(rows[0].album).toHaveLength(6);expect(rows[1].album).toBeUndefined();expect(rows[2].album).toBeUndefined();expect(rows[0].contenido).toBe('Las fotos');
});
test('tres recursos o una página parcial no inventan un álbum y eliminar hasta tres lo desagrupa',()=>{
 const items=[1,2,3].map(id=>message(id));expect(groupAttachmentMessages(items).every(m=>!m.album)).toBe(true);expect(groupAttachmentMessages([...items,message(4)])).toHaveLength(1);expect(groupAttachmentMessages([...items,message(4,{eliminado:true,adjunto:undefined})])).toHaveLength(4);
});
test('el mosaico muestra cuatro celdas y +3 abre el cuarto recurso de una tanda de seis',()=>{
 const messages=Array.from({length:6},(_,i)=>message(i+1)),remove=vi.fn();render(<MediaGalleryProvider messages={messages} onDelete={remove} canDelete={()=>true}><ul><AttachmentAlbum messages={messages} own first/></ul></MediaGalleryProvider>);const album=screen.getByRole('group',{name:'Álbum de 6 recursos'});expect(within(album).getAllByRole('button',{name:/Abrir/})).toHaveLength(4);expect(within(album).getByText('+3')).toBeInTheDocument();expect(screen.getByText('Las fotos')).toBeInTheDocument();fireEvent.click(within(album).getByRole('button',{name:'Abrir 3 recursos restantes'}));let dialog=screen.getByRole('dialog',{name:'foto4.png'});expect(within(dialog).queryByRole('button',{name:/Editar/})).not.toBeInTheDocument();fireEvent.click(within(dialog).getByRole('button',{name:'Recurso siguiente'}));dialog=screen.getByRole('dialog',{name:'foto5.png'});fireEvent.click(within(dialog).getByRole('button',{name:'Eliminar recurso'}));expect(remove).toHaveBeenCalledWith(5,expect.any(HTMLElement));
});
test('una tanda de cuatro no muestra contador y una de cinco muestra +2',()=>{
 const items=[1,2,3,4].map(id=>message(id));const view=render(<MediaGalleryProvider messages={items}><ul><AttachmentAlbum messages={items} own first/></ul></MediaGalleryProvider>);expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();const five=[...items,message(5)];view.rerender(<MediaGalleryProvider messages={five}><ul><AttachmentAlbum messages={five} own first/></ul></MediaGalleryProvider>);expect(screen.getByText('+2')).toBeInTheDocument();
});
test('el mensaje de un recurso ofrece eliminar y oculta editar aunque reciba onEdit',()=>{
 render(<ul><ChatMessage mensaje={message(1)} own connected first onEdit={vi.fn()} onDelete={vi.fn()}/></ul>);fireEvent.click(screen.getByRole('button',{name:'Opciones del mensaje'}));expect(screen.queryByRole('menuitem',{name:/Editar mensaje/})).not.toBeInTheDocument();expect(screen.getByRole('menuitem',{name:'Eliminar recurso'})).toBeInTheDocument();
});
test('el visor no ofrece eliminar recursos ajenos ni mantiene abierto un archivo eliminado',()=>{
 const items=[1,2,3,4].map(id=>message(id));const show=messages=><MediaGalleryProvider messages={messages} onDelete={vi.fn()} canDelete={()=>false}><ul><AttachmentAlbum messages={messages} own first/></ul></MediaGalleryProvider>;const view=render(show(items));fireEvent.click(screen.getByRole('button',{name:'Abrir foto1.png'}));expect(within(screen.getByRole('dialog')).queryByRole('button',{name:'Eliminar recurso'})).not.toBeInTheDocument();view.rerender(show(items.slice(1)));expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
