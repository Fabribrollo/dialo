import {MessageInteractionContext,ReplyComposer} from './MessageInteractions.jsx';
import {useContext,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {api} from '../../services/api.js';
import Icon from '../ui/Icon.jsx';
import Dialog from '../ui/Dialog.jsx';
import Button from '../ui/Button.jsx';
import {avisar} from '../shell/systemToastsStore.js';
import './attachmentCard.css';
const MEDIA=['image/png','image/jpeg','image/webp','video/mp4','video/webm'];
const MAX_FILES=6,MAX_TOTAL=20*1024*1024;
export default function SharedFiles({tipo,id,canWrite=true,onSent}){
 const interactions=useContext(MessageInteractionContext);
 const [open,setOpen]=useState(false),[files,setFiles]=useState([]),[active,setActive]=useState(0),[text,setText]=useState(''),[busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[position,setPosition]=useState({});
 const trigger=useRef(null),menu=useRef(null),input=useRef(null),kind=useRef('media'),pending=useRef(false),alive=useRef(true),destination=useRef(''),draft=useRef([]),upload=useRef(null),receipt=useRef(null);
 destination.current=`${tipo}:${id}`;
 function discard(){draft.current.forEach(f=>URL.revokeObjectURL(f.url));draft.current=[];setFiles([]);setActive(0);setText('');setOpen(false);}
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;upload.current?.abort();draft.current.forEach(f=>URL.revokeObjectURL(f.url));draft.current=[];};},[]);
 useEffect(()=>{upload.current?.abort();discard();},[tipo,id,canWrite]);
 useLayoutEffect(()=>{
  if(!open)return;
  const place=()=>{const b=trigger.current?.getBoundingClientRect();if(!b)return;const height=menu.current?.offsetHeight??130,above=b.top-height-10;setPosition({left:Math.max(12,Math.min(b.left,window.innerWidth-260)),top:Math.max(12,above>=12?above:Math.min(b.bottom+8,window.innerHeight-height-12))});};
  place();menu.current?.querySelector('button')?.focus();
  const outside=e=>{if(!menu.current?.contains(e.target)&&!trigger.current?.contains(e.target))setOpen(false);};
  const key=e=>{if(e.key==='Escape'){setOpen(false);trigger.current?.focus();}if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();const buttons=[...menu.current.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);buttons[(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key);window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key);window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
 },[open]);
 function pick(type){kind.current=type;input.current.accept=type==='media'?MEDIA.join(','):type==='audio'?'audio/webm,audio/ogg,audio/mp4':'application/pdf';setOpen(false);input.current.click();}
 function choose(e){
  const incoming=[...e.target.files];e.target.value='';if(!incoming.length)return;
  if(incoming.length+draft.current.length>MAX_FILES){avisar({tipo:'error',texto:'Podés enviar hasta 6 archivos juntos.'});return;}
  for(const file of incoming){
   if(!(kind.current==='media'?MEDIA.includes(file.type):kind.current==='audio'?['audio/webm','audio/ogg','audio/mp4'].includes(file.type):file.type==='application/pdf'||/\.pdf$/i.test(file.name))){avisar({tipo:'error',texto:kind.current==='media'?'Elegí imágenes JPG, PNG, WebP o videos MP4/WebM.':kind.current==='audio'?'Elegí audio WebM, Ogg o M4A.':'Elegí documentos PDF.'});return;}
   const video=file.type.startsWith('video/');if(file.size>(video?2:5)*1024*1024){avisar({tipo:'error',texto:video?'El video no puede superar 2 MB.':'El archivo no puede superar 5 MB.'});return;}
  }
  if([...draft.current.map(f=>f.file),...incoming].reduce((n,f)=>n+f.size,0)>MAX_TOTAL){avisar({tipo:'error',texto:'El envío completo no puede superar 20 MB.'});return;}
  const next=[...draft.current,...incoming.map(file=>({file,url:URL.createObjectURL(file),audio:kind.current==='audio',document:kind.current==='document',video:file.type.startsWith('video/')}))];
  setActive(draft.current.length);draft.current=next;setFiles(next);
 }
 function remove(index){const next=draft.current.filter((_,i)=>i!==index);URL.revokeObjectURL(draft.current[index].url);draft.current=next;setFiles(next);setActive(v=>Math.max(0,Math.min(v,next.length-1)));if(!next.length)setText('');}
 async function send(){
  if(!files.length||pending.current||!canWrite)return;
  pending.current=true;setBusy(true);const original=destination.current,body=new FormData();body.append('tipo',tipo);body.append('id',String(id));body.append('texto',text.trim());if(interactions?.reply)body.append('idRespuesta',String(interactions.reply.id));files.forEach(f=>body.append('archivo',f.file));
  const fingerprint=JSON.stringify([text.trim(),interactions?.reply?.id??null,...files.map(f=>f.url)]);if(receipt.current?.fingerprint!==fingerprint)receipt.current={fingerprint,key:crypto.randomUUID()};body.append('idEnvio',receipt.current.key);
  upload.current=new AbortController();setProgress(0);
  try{const result=await (api.upload?api.upload('/files/batch',body,{signal:upload.current.signal,onProgress:value=>{if(alive.current&&original===destination.current)setProgress(value);}}):api.post('/files/batch',body));if(alive.current&&original===destination.current){discard();interactions?.setReply(null);onSent?.(result.mensajes??[]);}}
  catch(e){if(alive.current&&original===destination.current)avisar({tipo:'error',texto:e.name==='AbortError'?'Transferencia cancelada. Revisá el historial si ya había terminado.':e.message});}
  finally{pending.current=false;if(alive.current)setBusy(false);}
 }
 if(!canWrite)return null;const selected=files[active];
 return <>
 <button ref={trigger} type="button" className="media-upload pr" aria-label="Adjuntar recurso" aria-haspopup="menu" aria-expanded={open} disabled={busy} onClick={()=>setOpen(v=>!v)}><Icon name="mas" size={20}/></button>
 <input ref={input} type="file" multiple className="sr-only" aria-label="Seleccionar archivo adjunto" tabIndex={-1} onChange={choose}/>
 {open&&createPortal(<div ref={menu} className="attachment-menu lg" role="menu" aria-label="Tipo de adjunto" style={position}>
  <button type="button" role="menuitem" onClick={()=>pick('media')}><span className="attachment-menu-icon"><Icon name="camara" size={20}/></span><span>Fotos y videos<small>Imágenes 5 MB · videos 2 MB</small></span></button>
  {interactions&&<button type="button" role="menuitem" onClick={()=>{setOpen(false);window.dispatchEvent(new Event('dialo:poll'));}}><span className="attachment-menu-icon"><Icon name="grilla" size={20}/></span><span>Encuesta</span></button>}
  <button type="button" role="menuitem" onClick={()=>pick('audio')}><span className="attachment-menu-icon"><Icon name="microfono" size={20}/></span><span>Audio<small>Hasta 5 MB</small></span></button>
  <button type="button" role="menuitem" onClick={()=>pick('document')}><span className="attachment-menu-icon"><Icon name="subir" size={20}/></span><span>Documento<small>PDF hasta 5 MB</small></span></button>
 </div>,document.body)}
 {createPortal(<Dialog open={Boolean(files.length)} label="Vista previa del adjunto" className="attachment-compose" returnFocusRef={trigger}>
 {selected&&<>
  <header><h2>{selected.document?'Documento':'Vista previa'}</h2><span className="attachment-count">{files.length} de 6</span><Button variant="secundario" disabled={busy} onClick={discard}>Cancelar</Button></header>
  <div className="attachment-compose-stage" key={selected.url}>{selected.audio?<audio src={selected.url} controls aria-label="Vista previa del audio"/>:selected.document?<iframe title="Vista previa del documento" src={selected.url}/>:selected.video?<video src={selected.url} controls playsInline/>:<img src={selected.url} alt="Vista previa antes de enviar"/>}</div>
  {busy&&<div className="upload-status" role="status"><progress value={progress} max="100" aria-label="Progreso de subida"/><span>{progress===100?'Confirmando envío…':`Enviando… ${progress}%`}</span><Button variant="secundario" onClick={()=>upload.current?.abort()}>Cancelar envío</Button></div>}
  <div className="attachment-drafts" aria-label="Archivos por enviar">
   {files.map((f,i)=><div className="attachment-draft" key={f.url}><button type="button" disabled={busy} aria-label={`Ver archivo ${i+1}`} aria-pressed={active===i} onClick={()=>setActive(i)}>{f.audio?<span><Icon name="microfono" size={22}/></span>:f.document?<span>PDF</span>:f.video?<><video src={f.url} muted playsInline preload="metadata"/><span className="attachment-video-icon"><Icon name="camara" size={16}/></span></>:<img src={f.url} alt=""/>}</button><button type="button" className="attachment-remove" disabled={busy} aria-label={`Quitar archivo ${i+1}`} onClick={()=>remove(i)}>×</button></div>)}
   {files.length<MAX_FILES&&<div className="attachment-add"><button type="button" disabled={busy} onClick={()=>pick('media')}><Icon name="mas" size={16}/>Fotos/videos</button><button type="button" disabled={busy} onClick={()=>pick('document')}><Icon name="mas" size={16}/>PDF</button></div>}
  </div>
  {selected.document&&<strong className="attachment-document-name">{selected.file.name}</strong>}
  <ReplyComposer/><form className="attachment-compose-bar" onSubmit={e=>{e.preventDefault();e.stopPropagation();send();}}><label className="attachment-text"><span className="sr-only">Texto del adjunto</span><textarea rows={1} placeholder="Agregá un mensaje…" value={text} maxLength={2000} disabled={busy} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();send();}}}/></label><Button type="submit" loading={busy} aria-label="Enviar adjunto"><Icon name="enviar" size={19}/><span>Enviar{files.length>1?` (${files.length})`:''}</span></Button></form>
 </>}
 </Dialog>,document.body)}</>;
}
