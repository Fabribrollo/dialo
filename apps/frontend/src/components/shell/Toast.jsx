import {useEffect,useRef,useState} from 'react';
import Avatar from '../ui/Avatar.jsx';
import Icon,{Spinner} from '../ui/Icon.jsx';
export default function Toast({aviso,onClose}){
 const [paused,setPaused]=useState(false),[busy,setBusy]=useState(false);const remaining=useRef(aviso.duracion??7000),started=useRef(0),close=useRef(onClose);close.current=onClose;
 useEffect(()=>{if(!aviso.duracion||paused)return;started.current=Date.now();const id=setTimeout(()=>close.current(),Math.max(0,remaining.current));return()=>{clearTimeout(id);remaining.current-=Date.now()-started.current;};},[paused,aviso.key]);
 async function action(fn){if(busy)return;setBusy(true);try{await fn?.();close.current(false);}catch{setBusy(false);}}
 const actions=aviso.acciones??(aviso.accion?[aviso.accion]:[]);
 return <li className={`unified-toast unified-${aviso.tipo}`} role={aviso.tipo==='error'?'alert':'status'} onMouseEnter={()=>setPaused(true)} onMouseLeave={()=>setPaused(false)} onFocus={()=>setPaused(true)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setPaused(false);}}>
  {aviso.foto||aviso.nombre?<Avatar nombre={aviso.nombre} foto={aviso.foto} size={38}/>:<span className="unified-toast-icon">{aviso.tipo==='cargando'?<Spinner size={18}/>:<Icon name={aviso.tipo==='error'?'error':aviso.tipo==='ok'?'check':'info'} size={18}/>}</span>}
  <span className="unified-toast-content">{aviso.titulo&&<strong>{aviso.titulo}</strong>}{aviso.texto&&<span>{aviso.texto}</span>}{actions.length>0&&<span className="unified-toast-actions">{actions.map((a,i)=><button type="button" className="pr" key={a.label??i} disabled={busy||a.disabled} onClick={()=>action(a.fn)}>{a.label}</button>)}</span>}</span>
  <button type="button" className="unified-toast-close pr" aria-label={`Cerrar aviso${aviso.titulo?`: ${aviso.titulo}`:''}`} disabled={busy} onClick={()=>close.current()}><Icon name="cerrar" size={16}/></button>
 </li>;
}
