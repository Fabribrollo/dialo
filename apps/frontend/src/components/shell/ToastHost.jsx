import {useEffect,useRef,useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {cerrarAviso,leerAvisos,suscribirAvisos} from './systemToastsStore.js';
import Toast from './Toast.jsx';
import './unifiedToasts.css';
const noop=()=>{};
export default function ToastHost({navigate=noop}){
 const list=useSyncExternalStore(suscribirAvisos,leerAvisos,leerAvisos),host=useRef(null);
 useEffect(()=>{const el=host.current;if(!el?.showPopover)return;try{if(list.length&&!el.matches(':popover-open'))el.showPopover();else if(!list.length&&el.matches(':popover-open'))el.hidePopover();}catch{}},[list.length]);
 const visible=[...list].sort((a,b)=>(a.tipo==='llamada'?1:0)-(b.tipo==='llamada'?1:0)).slice(-3);
 return createPortal(<ol ref={host} popover="manual" className="unified-toast-host" aria-label="Avisos del sistema" aria-live="polite">{visible.map(raw=>{
  const aviso=raw.tipo==='invitacion'?{...raw,origen:'canalVoz',titulo:`Llamada en ${raw.canal}`,texto:`${raw.personas?.slice(0,3).join(', ')??''} · ${raw.comunidad}`,acciones:[{label:'Unirme',principal:true,fn:()=>navigate(raw.destino)},{label:'Ahora no',fn:()=>{}}]}:raw;
  const close=(dismiss=true)=>{cerrarAviso(aviso.key);if(dismiss)aviso.onDismiss?.();};return <Toast key={`${aviso.key}:${aviso.revision}`} aviso={aviso} onClose={close}/>;
 })}</ol>,document.body);
}
