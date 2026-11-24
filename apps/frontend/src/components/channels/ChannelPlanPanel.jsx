import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api.js';
import { useUnsavedChanges } from '../../context/UnsavedChangesContext.jsx';
import { permissionLabels } from '../../utils/permissionCatalog.js';
import Button from '../ui/Button.jsx';
import Field from '../ui/Field.jsx';
import Notice from '../ui/Notice.jsx';
import './channelPlan.css';

export default function ChannelPlanPanel({id,onDone,onCancel}){
 const [text,setText]=useState(''),[plan,setPlan]=useState(null),[question,setQuestion]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[ack,setAck]=useState(false),[stale,setStale]=useState(false);
 const alive=useRef(true),pending=useRef(false);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const {markSaved}=useUnsavedChanges(Boolean(text||plan),'Plan de canales',JSON.stringify([text,plan?.id]));
 const deleted=plan?.antes.filter(c=>!plan.despues.some(next=>next.id===c.id))??[];
 async function run(operation){if(pending.current)return;pending.current=true;setBusy(true);setError('');try{await operation();}catch(e){if(alive.current){setError(e.message);if(['PLAN_STALE','PLAN_CLOSED'].includes(e.code))setStale(true);}}finally{pending.current=false;if(alive.current)setBusy(false);}}
 const cancelCurrent=()=>plan&&!stale?api.post(`/communities/${id}/channel-plans/${plan.id}/cancel`,{}):Promise.resolve();
 function generate(){run(async()=>{
  await cancelCurrent();if(!alive.current)return;setPlan(null);setAck(false);setStale(false);setQuestion('');
  const r=await api.post(`/communities/${id}/channel-plans`,{instrucciones:text.trim()});if(alive.current){setPlan(r.propuesta);setQuestion(r.aclaracion);}
 });}
 function cancel(){run(async()=>{await cancelCurrent();if(alive.current){markSaved();onCancel();}});}
 function confirm(){run(async()=>{await api.post(`/communities/${id}/channel-plans/${plan.id}/confirm`,{});if(alive.current){markSaved();onDone();}});}
 return <section className="set-card channel-plan" aria-label="Organizar canales con IA">
  <header className="set-head"><h2>Organizar canales con IA</h2><p>Describí qué querés cambiar. Primero revisás el plan y después decidís si lo aplicás.</p></header>
  <Field as="textarea" label="Cambios que querés hacer" value={text} onChange={e=>setText(e.target.value)} maxLength={1600} disabled={busy} placeholder="Ej. Creá un canal de recursos, renombrá general a consultas y mové la sala de estudio al final."/>
  <div className="plan-actions"><Button disabled={busy||text.trim().length<10} loading={busy} onClick={generate}>{plan?'Generar otro plan':'Preparar propuesta'}</Button><Button variant="secundario" disabled={busy} onClick={cancel}>Cancelar</Button></div>
  {busy&&<p role="status">Procesando el plan…</p>}{error&&<Notice tone="error" title={error}/>}{question&&<Notice title="Necesito una aclaración">{question}</Notice>}
  {plan&&<>
   <h3>Antes y después</h3><p>La lista muestra el orden final. Los canales privados conservan su admisión. La propuesta vence a las {new Date(plan.vence).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}.</p>
   <ol className="plan-list">{plan.despues.map((item,index)=>{const old=plan.antes.find(c=>c.id===item.id);return <li key={item.id??`nuevo-${index}`}>
    <strong>{index+1}. {old&&old.nombre!==item.nombre?<><del>{old.nombre}</del> → {item.nombre}</>:item.nombre}</strong>
    <span>{item.id===null?'Nuevo canal':`Canal #${item.id}`} · {item.tipo==='TEXTO'?'Texto':'Voz'} · {item.privado?'Privado':'Público'}</span>
    {old&&old.posicion!==index&&<span>Posición {old.posicion+1} → {index+1}</span>}
    {!item.privado&&<><span>Antes: {old?.permisosGlobales.map(p=>permissionLabels[p]??p).join(', ')||'Sin permisos de participación'}</span><span>Después: {item.permisosGlobales.filter(p=>p!=='VER').map(p=>permissionLabels[p]??p).join(', ')||'Solo lectura'}</span></>}
   </li>;})}</ol>
   {deleted.length>0&&<div className="plan-destructive"><h3>Se eliminarán {deleted.length} canales y sus historiales</h3><ul>{deleted.map(c=><li key={c.id}>{c.nombre} · #{c.id}</li>)}</ul><label><input type="checkbox" checked={ack} disabled={busy} onChange={e=>setAck(e.target.checked)}/>Entiendo que estos canales y sus mensajes se eliminarán definitivamente</label></div>}
   {!plan.despues.length&&<p>La comunidad quedará sin canales.</p>}
   <Button variant={deleted.length?'peligro':'primario'} disabled={busy||stale||(deleted.length>0&&!ack)} loading={busy} onClick={confirm}>Confirmar cambios de canales</Button>
  </>}
 </section>;
}
