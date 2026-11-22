import {createContext,useContext,useEffect,useLayoutEffect,useRef,useState,useCallback,useMemo} from 'react';
import {useSocket} from '../../hooks/useSocket.js';
import Icon from '../ui/Icon.jsx';
import {API_URL} from '../../constants/api.js';
import AttachmentCard from './AttachmentCard.jsx';
import {createPortal} from 'react-dom';
import Dialog from '../ui/Dialog.jsx';
import Button from '../ui/Button.jsx';
import {avisar} from '../shell/systemToastsStore.js';
import './messageInteractions.css';
export const MessageInteractionContext=createContext(null);
const mergePins=(rows,updates)=>{const map=new Map(rows.filter(m=>!m.eliminado&&m.fechaFijado).map(m=>[m.id,m]));for(const m of updates){if(m.eliminado||!m.fechaFijado)map.delete(m.id);else map.set(m.id,m);}return [...map.values()].sort((a,b)=>new Date(b.fechaFijado)-new Date(a.fechaFijado)||b.id-a.id);};
const EMOJIS=['👍','❤️','😂','😮','😢','🙏'];
export function useMessageInteractions({id,event,action,messages,usuario,connected,canWrite,canPin,onDelete,canDelete,inputId,otherName,loadOlder,hasOlder,loadingOlder,onLocate,acceptMessages}){
 const [reply,setReply]=useState(null),[pins,setPins]=useState(null),[loading,setLoading]=useState(false),[pinned,setPinned]=useState([]),[pinsReady,setPinsReady]=useState(false),[thread,setThread]=useState(null),[locating,setLocating]=useState(null),[step,setStep]=useState(0);
 const socket=useSocket(),pinBuffer=useRef(null),locatePending=useRef(false),locatePages=useRef(0);
 const ref=useRef({}),generation=useRef(0),request=useRef(0);
 ref.current={id,event,action,messages,connected,usuario,inputId,otherName,onDelete,canDelete,loadOlder,hasOlder,loadingOlder,onLocate,acceptMessages};
 const messageById=useMemo(()=>new Map(messages.map(m=>[m.id,m])),[messages]);
 useEffect(()=>{generation.current++;setReply(null);setPins(null);setPinned([]);setPinsReady(false);setThread(null);setLocating(null);setLoading(false);return()=>{generation.current++;};},[id,event]);
 useEffect(()=>{if(reply&&messageById.get(reply.id)?.eliminado)setReply(null);},[messageById,reply]);
 useEffect(()=>{if(!connected){request.current++;setPins(null);setLoading(false);}},[connected]);
 const applyPin=useCallback(message=>{
  if(pinBuffer.current)pinBuffer.current.set(message.id,message);
  setPinned(rows=>mergePins(rows,[message]));
  setPins(rows=>rows===null?null:mergePins(rows,[message]));
 },[]);
 const interact=useCallback(async payload=>{const c=ref.current,version=generation.current,result=await c.action(c.event,payload);if(version===generation.current&&result.mensaje)applyPin(result.mensaje);return result;},[applyPin]);
 const loadPins=useCallback(async(show=true)=>{
  const version=generation.current,number=++request.current;pinBuffer.current=new Map();if(show){setPins([]);setLoading(true);}
  const valid=()=>version===generation.current&&number===request.current;
  try{const data=await interact({accion:'fijados',idDestino:ref.current.id});if(valid()){const items=mergePins(data.items??[],[...pinBuffer.current.values()]);setPinned(items);setPinsReady(true);if(show)setPins(items);}}
  catch(e){if(valid()&&show){setPins(null);avisar({tipo:'error',texto:e.message});}}
  finally{if(valid()){pinBuffer.current=null;setLoading(false);}}
 },[interact]);
 useEffect(()=>{
  if(!socket||!connected)return;
  const c=ref.current,channel=c.event.startsWith('channel-'),field=channel?'idCanal':'idConversacion',prefix=channel?'channel-message':'message';
  const update=({mensaje})=>{if(mensaje[field]===c.id)applyPin(mensaje);};
  const remove=data=>{if(data[field]===c.id)applyPin({id:data.idMensaje,eliminado:true});};
  socket.on(prefix+':updated',update);socket.on(prefix+':deleted',remove);loadPins(false);
  return()=>{socket.off(prefix+':updated',update);socket.off(prefix+':deleted',remove);};
 },[socket,connected,id,event,applyPin,loadPins]);
 const sendAction=useCallback((action,payload)=>ref.current.action(ref.current.event.replace(':interact',':'+action),payload),[]);
 const sendFeature=useCallback(payload=>{const c=ref.current;return c.action(c.event.replace(':interact',':send'),{[c.event.startsWith('channel-')?'idCanal':'idConversacion']:c.id,...payload});},[]);
 const accept=useCallback(message=>ref.current.acceptMessages?.([message]),[]);
 const locate=useCallback(message=>{ref.current.onLocate?.();locatePages.current=0;setPins(null);setLocating(message);setStep(n=>n+1);},[]);
 useEffect(()=>{
  if(!locating)return;
  const node=document.querySelector(`[data-message-id="${locating.id}"]`);
  if(node){setLocating(null);requestAnimationFrame(()=>{node.scrollIntoView?.({block:'center',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});node.focus?.({preventScroll:true});node.classList.add('message-located');setTimeout(()=>node.classList.remove('message-located'),1800);});return;}
  const c=ref.current;
  if(!hasOlder||!c.loadOlder||locatePages.current>=40){setLocating(null);avisar({tipo:'error',texto:'No se pudo localizar el mensaje en el historial disponible.'});return;}
  if(loadingOlder||locatePending.current)return;
  locatePending.current=true;locatePages.current++;const version=generation.current;
  Promise.resolve(c.loadOlder()).catch(()=>{}).finally(()=>{locatePending.current=false;if(version===generation.current)setStep(n=>n+1);});
 },[locating,messages,hasOlder,loadingOlder,step]);
 const chooseReply=useCallback(m=>{const c=ref.current;setReply({...m,autorNombre:m.autor?.nombreVisible??(m.idAutor===c.usuario?.id?'vos':c.otherName??'este mensaje')});setPins(null);requestAnimationFrame(()=>document.getElementById(c.inputId)?.focus());},[]);
 const remove=useCallback((...args)=>ref.current.onDelete?.(...args),[]),mayDelete=useCallback(m=>ref.current.canDelete?.(m),[]);
 return useMemo(()=>({reply,setReply,thread,setThread,sendAction,sendFeature,accept,pins,setPins,pinned,pinsReady,locating,setLocating,locate,loading,loadPins,interact,chooseReply,connected,canWrite,canPin,usuario,onDelete:remove,canDelete:mayDelete,messages,messageById}),[reply,thread,sendAction,sendFeature,accept,pins,pinned,pinsReady,locating,locate,loading,loadPins,interact,chooseReply,connected,canWrite,canPin,usuario?.id,remove,mayDelete,messages,messageById]);
}

const preview=m=>m?.eliminado?'Mensaje eliminado':m?.contenido&&m.contenido!=='Archivo adjunto'?m.contenido:m?.tipoAdjunto?.startsWith('video/')||m?.adjunto?.tipo?.startsWith('video/')?'Video':m?.tipoAdjunto==='application/pdf'||m?.adjunto?.tipo==='application/pdf'?'Documento PDF':'Foto';
export function ReplyQuote({message}){
 const context=useContext(MessageInteractionContext),original=message.respuesta;
 if(!original)return null;const loaded=context?.messageById?.get(original.id),current=loaded??original;
 return <blockquote className="message-quote"><b>{original.autor}</b><span>{preview(current)}</span></blockquote>;
}
export function ReplyComposer(){const c=useContext(MessageInteractionContext);return c?.reply?<div className="reply-composer" role="status"><span><b>Respondiendo a {c.reply.autorNombre??c.reply.autor?.nombreVisible??'este mensaje'}</b><small>{preview(c.reply)}</small></span><button type="button" aria-label="Cancelar respuesta" onClick={()=>c.setReply(null)}>×</button></div>:null;}
export function PinnedMessages(){
 const c=useContext(MessageInteractionContext),[index,setIndex]=useState(0);
 const visiblePins=c?(c.pinsReady?c.pinned:mergePins(c.pinned??[],c.messages)):[];
 const ids=visiblePins.map(m=>m.id).join(',');useEffect(()=>setIndex(0),[ids]);
 if(!c)return null;const selected=visiblePins[index%visiblePins.length];
 return <>{selected&&<div className="pinned-message-bar" aria-label="Barra de mensajes fijados">
 <span className="pinned-stripes" aria-hidden="true">{visiblePins.slice(0,5).map((m,i)=><i key={m.id} className={i===index%Math.min(5,visiblePins.length)?'active':''}/>)}</span><Icon name="pin" size={16}/>
 <button type="button" className="pinned-preview" aria-label="Ir al mensaje fijado" onClick={()=>{c.locate(selected);setIndex(i=>(i+1)%visiblePins.length);}}><strong>Mensaje fijado{visiblePins.length>1?` · ${index+1} de ${visiblePins.length}`:''}</strong><span>{preview(selected)}</span></button>
 {selected.adjunto?.tipo?.startsWith('image/')&&<img className="pinned-thumbnail" src={`${API_URL}/files/${selected.adjunto.id}`} alt=""/>}
 </div>}
 {c.locating&&<div className="pin-locating" role="status"><span>Buscando mensaje fijado…</span><button type="button" onClick={()=>c.setLocating(null)}>Cancelar</button></div>}
 </>;
}
export function MessageOptions({message,onEdit,onDelete,connected=true}){
 const context=useContext(MessageInteractionContext),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[position,setPosition]=useState({}),trigger=useRef(null),menu=useRef(null);
 connected=connected&&context?.connected!==false;
 const deleted=message.eliminado||message.registroLlamada;
 const remove=onDelete??(context?.canDelete?.(message)?(_,button)=>context.onDelete?.(message.id,button):null);
 const available=Boolean(context||onEdit||remove||message.contenido);
 const close=(focus=false)=>{setOpen(false);if(focus)trigger.current?.focus();};
 useLayoutEffect(()=>{if(!open)return;
  const place=()=>{const b=trigger.current?.getBoundingClientRect(),el=menu.current;if(!b||!el)return;const width=Math.min(284,window.innerWidth-24),height=el.offsetHeight;setPosition({width,left:Math.max(12,Math.min(b.right-width,window.innerWidth-width-12)),top:Math.max(12,Math.min(b.bottom+6,window.innerHeight-height-12))});};
  place();menu.current?.querySelector('button:not(:disabled)')?.focus();
  const outside=e=>{if(!menu.current?.contains(e.target)&&!trigger.current?.contains(e.target))close();};
  const key=e=>{if(e.key==='Escape'){e.preventDefault();close(true);}if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const items=[...menu.current.querySelectorAll('button:not(:disabled)')],index=items.indexOf(document.activeElement),next=e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next]?.focus();}if(e.key==='Tab')close();};
  const another=e=>{if(e.detail!==message.id)close();};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key);document.addEventListener('dialo:message-menu',another);window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key);document.removeEventListener('dialo:message-menu',another);window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
 },[open,message.id]);
 useEffect(()=>{if(deleted)close();},[deleted]);
 async function run(operation){if(busy)return;setBusy(true);try{await operation();close(true);}catch(e){avisar({tipo:'error',texto:e.message||'No se pudo completar la acción.'});}finally{setBusy(false);}}
 const reaction=emoji=>run(()=>context.interact({accion:'reaccionar',idMensaje:message.id,emoji:message.reacciones?.find(r=>r.usuarios.includes(context.usuario?.id))?.emoji===emoji?null:emoji}));
 if(deleted||!available)return null;
 return <span className="message-options"><button ref={trigger} type="button" className="message-options-trigger pr" aria-haspopup="menu" aria-expanded={open} aria-label="Opciones del mensaje" onClick={()=>{document.dispatchEvent(new CustomEvent('dialo:message-menu',{detail:message.id}));setOpen(v=>!v);}}><span aria-hidden="true">•••</span></button>
 {open&&createPortal(<div ref={menu} style={position} role="menu" aria-label="Acciones del mensaje" className="message-menu lg">
 {context?.canWrite&&<div className="message-quick-reactions" role="group" aria-label="Reaccionar">{EMOJIS.map(emoji=><button type="button" key={emoji} role="menuitem" disabled={!connected||busy} aria-label={`Reaccionar ${emoji}`} onClick={()=>reaction(emoji)}>{emoji}</button>)}</div>}
 {context?.canWrite&&!message.idHilo&&<button type="button" role="menuitem" disabled={!connected||busy} onClick={()=>{context.chooseReply(message);close();}}>Responder</button>}
 {message.contenido&&message.contenido!=='Archivo adjunto'&&<button type="button" role="menuitem" disabled={busy} onClick={()=>run(async()=>{if(!navigator.clipboard?.writeText)throw new Error('El navegador no permite copiar texto en este contexto.');await navigator.clipboard.writeText(message.contenido);avisar({tipo:'ok',texto:'Texto copiado.'});})}>Copiar texto</button>}
 {context?.canPin&&<button type="button" role="menuitem" disabled={!connected||busy} onClick={()=>run(()=>context.interact({accion:'fijar',idMensaje:message.id,fijado:!message.fechaFijado}))}>{message.fechaFijado?'Desfijar':'Fijar mensaje'}</button>}
 {onEdit&&!message.adjunto&&!message.encuesta&&<button type="button" role="menuitem" disabled={!connected||busy} onClick={()=>{close();onEdit();}}>Editar mensaje</button>}
 {remove&&<button type="button" role="menuitem" className="message-menu-danger" disabled={!connected||busy} onClick={()=>{close();remove(message.id,trigger.current);}}>{message.adjunto?'Eliminar recurso':'Eliminar mensaje'}</button>}
 </div>,trigger.current?.closest('dialog')??document.body)}</span>;
}
export function MessageReactions({message}){
 const c=useContext(MessageInteractionContext);if(message.eliminado||!message.reacciones?.length)return null;
 return <div className="message-reactions" aria-label="Reacciones">{message.reacciones.map(r=><button type="button" key={r.emoji} className={r.usuarios.includes(c?.usuario?.id)?'reaction-own':''} aria-label={`${r.emoji}: ${r.usuarios.length} reacciones`} aria-pressed={r.usuarios.includes(c?.usuario?.id)} disabled={!c?.canWrite||!c?.connected} onClick={async()=>{try{await c.interact({accion:'reaccionar',idMensaje:message.id,emoji:r.usuarios.includes(c.usuario.id)?null:r.emoji});}catch(e){avisar({tipo:'error',texto:e.message});}}}>{r.emoji} <span>{r.usuarios.length}</span></button>)}</div>;
}
