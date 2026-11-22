import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import SharedFiles from '../components/chat/SharedFiles.jsx';
import AttachmentCard from '../components/chat/AttachmentCard.jsx';
const m=vi.hoisted(()=>({post:vi.fn()}));vi.mock('../services/api.js',()=>({api:{post:m.post}}));
beforeEach(()=>{let previewId=0;m.post.mockReset().mockResolvedValue({});vi.stubGlobal('URL',class extends URL {static createObjectURL=vi.fn(()=>`blob:preview-${++previewId}`);static revokeObjectURL=vi.fn();});});
afterEach(()=>vi.unstubAllGlobals());
const choose=(file,type='Fotos y videos')=>{fireEvent.click(screen.getByRole('button',{name:'Adjuntar recurso'}));fireEvent.click(screen.getByRole('menuitem',{name:new RegExp(type)}));fireEvent.change(screen.getByLabelText('Seleccionar archivo adjunto'),{target:{files:[file]}});};
const file=()=>new File(['test'],'foto.png',{type:'image/png'});
test('adjuntar abre primero un menú y elegir una foto requiere confirmar antes de enviar',async()=>{
 const sent=vi.fn();render(<SharedFiles tipo="canal" id={3} onSent={sent}/>);expect(screen.queryByRole('menu')).not.toBeInTheDocument();choose(file());expect(screen.getByRole('dialog',{name:'Vista previa del adjunto'})).toBeInTheDocument();expect(screen.getByRole('img',{name:'Vista previa antes de enviar'})).toHaveAttribute('src','blob:preview-1');expect(m.post).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Enviar adjunto'}));await waitFor(()=>expect(sent).toHaveBeenCalledOnce());expect(m.post).toHaveBeenCalledWith('/files/batch',expect.any(FormData));await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
});
test('cancelar la vista previa libera la imagen y no hace ninguna petición',()=>{
 render(<SharedFiles tipo="canal" id={3}/>);choose(file());fireEvent.click(screen.getByRole('button',{name:'Cancelar'}));expect(m.post).not.toHaveBeenCalled();expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(URL.revokeObjectURL).toHaveBeenCalled();
});
test('un error de subida conserva la vista previa para reintentar y evita doble envío',async()=>{
 let reject;m.post.mockReturnValueOnce(new Promise((_,r)=>{reject=r;}));render(<SharedFiles tipo="canal" id={3}/>);choose(file());const send=screen.getByRole('button',{name:'Enviar adjunto'});fireEvent.click(send);fireEvent.click(send);expect(m.post).toHaveBeenCalledOnce();await act(async()=>reject(new Error('Falló la subida')));expect(screen.getByRole('dialog')).toBeInTheDocument();await screen.findByText('Falló la subida');fireEvent.click(screen.getByRole('button',{name:'Enviar adjunto'}));await waitFor(()=>expect(m.post).toHaveBeenCalledTimes(2));
});
test('cambiar de chat descarta el adjunto sin enviarlo y una confirmación tardía no toca otro destino',async()=>{
 let resolve;m.post.mockReturnValue(new Promise(r=>{resolve=r;}));const sent=vi.fn(),view=render(<SharedFiles tipo="conversacion" id={3} onSent={sent}/>);choose(file());view.rerender(<SharedFiles tipo="conversacion" id={4} onSent={sent}/>);expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(m.post).not.toHaveBeenCalled();choose(file());fireEvent.click(screen.getByRole('button',{name:'Enviar adjunto'}));view.rerender(<SharedFiles tipo="conversacion" id={5} onSent={sent}/>);await act(async()=>resolve({}));expect(sent).not.toHaveBeenCalled();
});
test('documento abre su vista previa y el nombre solo identifica documentos, no imágenes enviadas',()=>{
 const view=render(<SharedFiles tipo="canal" id={3}/>);choose(new File(['%PDF-test'],'archivo.pdf',{type:'application/pdf'}),'Documento');expect(screen.getByTitle('Vista previa del documento')).toBeInTheDocument();expect(screen.getByText('archivo.pdf')).toBeInTheDocument();view.unmount();render(<AttachmentCard file={{id:3,tipo:'image/png',nombre:'foto.png'}}/>);expect(screen.queryByText('foto.png')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'Abrir foto.png'})).toBeInTheDocument();
});
test('el video se previsualiza con controles y no se publica sin confirmación',()=>{
 render(<SharedFiles tipo="canal" id={3}/>);choose(new File(['video'],'clip.mp4',{type:'video/mp4'}));const modal=screen.getByRole('dialog');expect(modal.querySelector('video')).toHaveAttribute('controls');expect(m.post).not.toHaveBeenCalled();
});
test('prepara varios medios con texto, cambia la vista previa y manda todo en un único envío',async()=>{
 render(<SharedFiles tipo="conversacion" id={3}/>);
 fireEvent.click(screen.getByRole('button',{name:'Adjuntar recurso'}));fireEvent.click(screen.getByRole('menuitem',{name:/Fotos y videos/}));
 fireEvent.change(screen.getByLabelText('Seleccionar archivo adjunto'),{target:{files:[file(),new File(['test2'],'segunda.png',{type:'image/png'})]}});
 expect(screen.getByRole('button',{name:'Ver archivo 1'})).toHaveAttribute('aria-pressed','true');fireEvent.click(screen.getByRole('button',{name:'Ver archivo 2'}));expect(screen.getByRole('button',{name:'Ver archivo 2'})).toHaveAttribute('aria-pressed','true');
 fireEvent.change(screen.getByRole('textbox',{name:'Texto del adjunto'}),{target:{value:'Estas son las fotos'}});expect(m.post).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Enviar adjunto'}));
 await waitFor(()=>expect(m.post).toHaveBeenCalledOnce());const body=m.post.mock.calls[0][1];expect(body.getAll('archivo')).toHaveLength(2);expect(body.get('texto')).toBe('Estas son las fotos');expect(body.get('id')).toBe('3');
});
test('quitar un medio conserva el texto y rechaza más de seis sin cargar nada',()=>{
 render(<SharedFiles tipo="canal" id={3}/>);choose(file());fireEvent.change(screen.getByRole('textbox'),{target:{value:'Un texto'}});fireEvent.click(screen.getByRole('button',{name:'Fotos/videos'}));fireEvent.change(screen.getByLabelText('Seleccionar archivo adjunto'),{target:{files:[file()]}});fireEvent.click(screen.getByRole('button',{name:'Quitar archivo 1'}));expect(screen.getByRole('textbox')).toHaveValue('Un texto');expect(URL.revokeObjectURL).toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Fotos/videos'}));fireEvent.change(screen.getByLabelText('Seleccionar archivo adjunto'),{target:{files:Array.from({length:6},file)}});expect(screen.getAllByRole('button',{name:/Ver archivo/})).toHaveLength(1);expect(m.post).not.toHaveBeenCalled();
});
test('enviar desde la vista previa integrada no dispara el formulario del chat',async()=>{
 const Composer=(await import('../components/chat/Composer.jsx')).default;const send=vi.fn();render(<Composer value="" onChange={()=>{}} onSend={send} canSend={false} label="Mensaje normal" attachment={{tipo:'canal',id:3}}/>);choose(file());fireEvent.change(screen.getByRole('textbox',{name:'Texto del adjunto'}),{target:{value:'Texto de la foto'}});fireEvent.click(screen.getByRole('button',{name:'Enviar adjunto'}));await waitFor(()=>expect(m.post).toHaveBeenCalledOnce());expect(send).not.toHaveBeenCalled();
});
test('la subida informa progreso, permite cancelar y conserva la clave al reintentar',async()=>{
 const original=m.post;let rejectUpload,progress;
 const module=await import('../services/api.js');module.api.upload=vi.fn((path,body,options)=>{progress=options.onProgress;return new Promise((resolve,reject)=>{rejectUpload=reject;options.signal.addEventListener('abort',()=>reject(new DOMException('Cancelado','AbortError')));});});
 try{render(<SharedFiles tipo="canal" id={3}/>);choose(file());fireEvent.click(screen.getByRole('button',{name:'Enviar adjunto'}));act(()=>progress(60));expect(screen.getByRole('progressbar')).toHaveAttribute('value','60');const key=module.api.upload.mock.calls[0][1].get('idEnvio');fireEvent.click(screen.getByRole('button',{name:'Cancelar envío'}));await waitFor(()=>expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());expect(screen.getByRole('dialog',{name:'Vista previa del adjunto'})).toBeInTheDocument();module.api.upload.mockResolvedValueOnce({mensajes:[]});fireEvent.click(screen.getByRole('button',{name:'Enviar adjunto'}));await waitFor(()=>expect(module.api.upload).toHaveBeenCalledTimes(2));expect(module.api.upload.mock.calls[1][1].get('idEnvio')).toBe(key);}finally{delete module.api.upload;}
});
