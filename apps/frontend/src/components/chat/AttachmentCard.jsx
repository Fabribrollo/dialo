import AudioMessage from './AudioMessage.jsx';
import {useRef,useState} from 'react';
import {API_URL} from '../../constants/api.js';
import {MediaViewer,useMediaGallery} from './MediaGallery.jsx';
import './attachmentCard.css';
export default function AttachmentCard({file}){
 const [open,setOpen]=useState(false);const trigger=useRef(null);const gallery=useMediaGallery();
 const image=file.tipo?['image/png','image/jpeg','image/webp'].includes(file.tipo):/\.(png|jpe?g|webp)$/i.test(file.nombre);
 const video=['video/mp4','video/webm'].includes(file.tipo);const href=`${API_URL}/files/${file.id}`;
 if(file.tipo?.startsWith('audio/'))return <AudioMessage file={file}/>;
 return <><button ref={trigger} type="button" className="attachment-card" onClick={()=>{if(gallery)gallery.open(file,trigger.current);else setOpen(true);}} aria-label={`Abrir ${file.nombre}`}>
  {image?<img className="attachment-preview" src={href} alt={`Vista previa de ${file.nombre}`} loading="lazy"/>:video?<video className="attachment-preview" src={href} muted playsInline preload="metadata" aria-label={`Vista previa de ${file.nombre}`}/>:<span className="attachment-format">PDF</span>}
  {!image&&!video&&<span className="attachment-caption"><strong>Documento PDF</strong><span>Abrir documento</span></span>}{video&&<span className="attachment-play" aria-hidden="true">▶</span>}
 </button>
 {!gallery&&<MediaViewer files={[file]} index={open?0:-1} onIndex={()=>{}} onClose={()=>setOpen(false)} returnFocusRef={trigger}/>}
 </>;
}
