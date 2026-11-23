import {useEffect,useRef,useState} from 'react';
import Avatar from '../ui/Avatar.jsx';
import Icon,{Spinner} from '../ui/Icon.jsx';
import {haceCuanto} from './NotificationToasts.jsx';

// Comunidad: cuadrado con siglas; persona: avatar; sistema: ícono del estado. El origen va como insignia.
function Visual({aviso}){
 const base=aviso.siglas?<span className="unified-toast-com" aria-hidden="true">{aviso.siglas}</span>
  :aviso.foto||aviso.nombre?<Avatar nombre={aviso.nombre} foto={aviso.foto} size={40}/>
  :<span className="unified-toast-icon">{aviso.tipo==='cargando'?<Spinner size={18}/>:<Icon name={aviso.tipo==='error'?'error':aviso.tipo==='ok'?'check':'info'} size={18}/>}</span>;
 const origen=aviso.origen??(aviso.tipo==='llamada'?'telefono':null);
 return <span className="unified-toast-visual">{base}{origen&&<span className="unified-toast-origin" aria-hidden="true"><Icon name={origen} size={12} stroke={2.4}/></span>}</span>;
}

export default function Toast({aviso,onClose}){
 const [paused,setPaused]=useState(false),[busy,setBusy]=useState(false);const remaining=useRef(aviso.duracion??7000),started=useRef(0),close=useRef(onClose);close.current=onClose;
 useEffect(()=>{if(!aviso.duracion||paused)return;started.current=Date.now();const id=setTimeout(()=>close.current(),Math.max(0,remaining.current));return()=>{clearTimeout(id);remaining.current-=Date.now()-started.current;};},[paused,aviso.key]);
 async function action(fn){if(busy)return;setBusy(true);try{await fn?.();close.current(false);}catch{setBusy(false);}}
 const actions=aviso.acciones??(aviso.accion?[aviso.accion]:[]);
 // La región del host ya anuncia en vivo; solo los errores se anuncian con prioridad.
 return <li className={`unified-toast unified-${aviso.tipo}${paused?' is-paused':''}`} role={aviso.tipo==='error'?'alert':undefined} onMouseEnter={()=>setPaused(true)} onMouseLeave={()=>setPaused(false)} onFocus={()=>setPaused(true)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setPaused(false);}}>
  <Visual aviso={aviso}/>
  <span className="unified-toast-content">
   {(aviso.titulo||aviso.fecha)&&<span className="unified-toast-head">{aviso.titulo&&<strong>{aviso.titulo}</strong>}{aviso.fecha&&<time dateTime={aviso.fecha}>{haceCuanto(aviso.fecha)}</time>}</span>}
   {aviso.texto&&<span className="unified-toast-text">{aviso.texto}</span>}
   {actions.length>0&&<span className="unified-toast-actions">{actions.map((a,i)=><button type="button" className={`pr${a.principal?' is-main':''}${a.peligro?' is-danger':''}`} key={a.label??i} disabled={busy||a.disabled} onClick={()=>action(a.fn)}>{a.label}</button>)}</span>}
  </span>
  <button type="button" className="unified-toast-close pr" aria-label={aviso.cerrarLabel??`Cerrar aviso${aviso.titulo?`: ${aviso.titulo}`:''}`} disabled={busy} onClick={()=>close.current()}><Icon name="cerrar" size={16}/></button>
  {aviso.duracion>0&&<span className="unified-toast-bar" aria-hidden="true" style={{animationDuration:`${aviso.duracion}ms`}}/>}
 </li>;
}
