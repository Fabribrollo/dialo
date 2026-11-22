import {fireEvent,render,screen,within} from '@testing-library/react';
import {expect,test} from 'vitest';
import AttachmentCard from '../components/chat/AttachmentCard.jsx';
import CallBar from '../components/calls/CallBar.jsx';
import {MemoryRouter} from 'react-router';
test('la imagen se amplía completa y descargar solo aparece dentro del visor',()=>{
 render(<AttachmentCard file={{id:8,nombre:'foto.png',tipo:'image/png'}}/>);
 expect(screen.queryByRole('link',{name:'Descargar'})).not.toBeInTheDocument();const open=screen.getByRole('button',{name:'Abrir foto.png'});open.focus();fireEvent.click(open);
 const modal=screen.getByRole('dialog',{name:'foto.png'});expect(within(modal).getByRole('img')).toHaveAttribute('src','/api/files/8');expect(within(modal).getByRole('link',{name:'Descargar'})).toHaveAttribute('href','/api/files/8?download=1');
 fireEvent.click(within(modal).getByRole('button',{name:'Cerrar recurso'}));expect(open).toHaveFocus();expect(screen.queryByRole('link',{name:'Descargar'})).not.toBeInTheDocument();
});
test('video usa vista previa y controles de reproducción en el visor',()=>{
 const {container}=render(<AttachmentCard file={{id:9,nombre:'clip.mp4',tipo:'video/mp4'}}/>);expect(container.querySelector('video')).not.toHaveAttribute('controls');
 fireEvent.click(screen.getByRole('button',{name:'Abrir clip.mp4'}));const video=screen.getByRole('dialog').querySelector('video');expect(video).toHaveAttribute('controls');expect(video).toHaveAttribute('playsinline');expect(video).toHaveAttribute('src','/api/files/9');
 fireEvent.error(video);expect(screen.getByRole('alert')).toHaveTextContent('perdiste el acceso');
});
test('la barra compartida conserva micrófono, regreso y cierre sin desplegar participantes',()=>{
 render(<MemoryRouter><CallBar title="Llamada privada" status="En la llamada" to="/conversaciones/4" backLabel="Volver al chat" people={Array.from({length:6},(_,i)=>({id:i,nombre:'Persona '+i}))}/></MemoryRouter>);
 const bar=screen.getByRole('complementary',{name:'Llamada activa'});expect(bar.querySelectorAll('.av')).toHaveLength(3);expect(bar.querySelector('[aria-expanded]')).toBeNull();expect(screen.getByRole('link',{name:'Volver al chat'})).toHaveAttribute('href','/conversaciones/4');expect(screen.getByRole('button',{name:'Finalizar llamada'})).toBeInTheDocument();
});
