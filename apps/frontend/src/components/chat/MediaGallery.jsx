import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {API_URL} from '../../constants/api.js';
import Dialog from '../ui/Dialog.jsx';
import Button from '../ui/Button.jsx';
import Icon from '../ui/Icon.jsx';
import {avisar} from '../shell/systemToastsStore.js';
const Context=createContext(null);
export const useMediaGallery=()=>useContext(Context);
export function MediaViewer({files,index,onIndex,onClose,returnFocusRef,onDelete,connected=true}){
 const file=files[index],root=useRef(null);const [failed,setFailed]=useState(false),[zoom,setZoom]=useState(false);
 useEffect(()=>{setFailed(false);setZoom(false);},[file?.id]);
 const href=file?`${API_URL}/files/${file.id}`:'',image=file?.tipo?.startsWith('image/')||(!file?.tipo&&/\.(png|jpe?g|webp)$/i.test(file?.nombre??'')),video=file?.tipo?.startsWith('video/'),audio=file?.tipo?.startsWith('audio/');
 const move=delta=>{if(index+delta>=0&&index+delta<files.length)onIndex(index+delta);};
 async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await root.current?.requestFullscreen();}catch{avisar({tipo:'error',texto:'El navegador no permitió la pantalla completa.'});}}
 return <Dialog open={Boolean(file)} onClose={onClose} label={file?.nombre??'Recurso'} className="media-viewer" returnFocusRef={returnFocusRef}>
 {file&&<div ref={root} className="media-gallery" onKeyDown={e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)&&!['INPUT','TEXTAREA'].includes(e.target.tagName)){e.preventDefault();move(e.key==='ArrowLeft'?-1:1);}}}>
 <header className="media-viewer-head"><strong>{file.nombre}</strong><span className="gallery-counter">{index+1} / {files.length}</span><a href={`${href}?download=1`} className="btn pr" download={file.nombre}><Icon name="subir" size={17}/>Descargar</a><Button variant="secundario" onClick={onClose} aria-label="Cerrar recurso">Cerrar</Button></header>
 <div className={`gallery-stage ${zoom?'gallery-zoom':''}`}>{failed?<p role="alert">El recurso ya no está disponible o perdiste el acceso.</p>:image?<img src={href} alt={file.nombre} onError={()=>setFailed(true)}/>:video?<video src={href} controls playsInline autoPlay onError={()=>setFailed(true)}/>:audio?<audio src={href} controls aria-label="Audio compartido"/>:<iframe src={href} title={file.nombre}/>}</div>
 <footer className="gallery-tools">{onDelete&&<Button variant="peligro" disabled={!connected} onClick={e=>onDelete(e.currentTarget)}>Eliminar recurso</Button>}<Button variant="secundario" disabled={index===0} onClick={()=>move(-1)} aria-label="Recurso anterior">←</Button><Button variant="secundario" disabled={index===files.length-1} onClick={()=>move(1)} aria-label="Recurso siguiente">→</Button>{image&&<Button variant="secundario" onClick={()=>setZoom(v=>!v)}>{zoom?'Ajustar imagen':'Ampliar imagen'}</Button>}<Button variant="secundario" disabled={!document.fullscreenEnabled} onClick={fullscreen}>Pantalla completa</Button></footer>
 </div>}
 </Dialog>;
}
export function MediaGalleryProvider({messages,children,onDelete,canDelete,connected=true}){
 const files=useMemo(()=>messages.filter(m=>!m.eliminado&&m.adjunto).map(m=>m.adjunto),[messages]),[opened,setOpened]=useState(null),trigger=useRef(null);const index=files.findIndex(f=>f.id===opened);
 useEffect(()=>{if(opened!==null&&index<0)setOpened(null);},[index,opened]);
 const selected=messages.find(m=>m.adjunto?.id===opened&&!m.eliminado);
 const open=useCallback((file,element)=>{trigger.current=element;setOpened(file.id);},[]);const value=useMemo(()=>({open}),[open]);
 return <Context.Provider value={value}>{children}<MediaViewer files={files} index={index} onIndex={i=>setOpened(files[i].id)} onClose={()=>setOpened(null)} returnFocusRef={trigger} connected={connected} onDelete={selected&&onDelete&&canDelete?.(selected)?button=>onDelete(selected.id,button):undefined}/></Context.Provider>;
}
