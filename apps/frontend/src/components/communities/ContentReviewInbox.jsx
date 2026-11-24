import { useEffect,useRef,useState } from 'react';
import { api } from '../../services/api.js';
import Button from '../ui/Button.jsx';
import Field from '../ui/Field.jsx';
import Notice from '../ui/Notice.jsx';
import { SkeletonRows } from '../ui/Skeleton.jsx';
import '../channels/channelPlan.css';
const labels={PENDIENTE:'Pendiente',DESCARTADO:'Descartado',SIN_SANCION:'Cerrado sin sanción',CON_MEDIDA:'Medida confirmada'};
export default function ContentReviewInbox({id}){
 const [active,setActive]=useState(false),[tab,setTab]=useState('PENDIENTE'),[items,setItems]=useState([]),[cursor,setCursor]=useState(null),[detail,setDetail]=useState(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reason,setReason]=useState(''),[measure,setMeasure]=useState(''),[duration,setDuration]=useState('30_MIN'),[scope,setScope]=useState('TEXTO'),[silenceDuration,setSilenceDuration]=useState('1_HORA'),[ack,setAck]=useState(false);
 const sequence=useRef(0),alive=useRef(true),pending=useRef(false);
 async function load(more=false){const seq=++sequence.current;setLoading(true);setError('');try{
  const [settings,list]=await Promise.all([api.get(`/communities/${id}/review/settings`),api.get(`/communities/${id}/review/cases?estado=${tab}${more&&cursor?'&cursor='+cursor:''}`)]);
  if(alive.current&&seq===sequence.current){setActive(settings.revisionActiva);setItems(old=>more?[...old,...list.items]:list.items);setCursor(list.nextCursor);}
 }catch(e){if(alive.current&&seq===sequence.current){setError(e.message);if([401,403,404].includes(e.status)){setItems([]);setDetail(null);setCursor(null);}}}finally{if(alive.current&&seq===sequence.current)setLoading(false);}}
 useEffect(()=>{alive.current=true;setDetail(null);setItems([]);setCursor(null);load();return()=>{alive.current=false;sequence.current++;};},[id,tab]);
 async function act(operation){if(pending.current)return;pending.current=true;setBusy(true);setError('');try{await operation();}catch(e){if(alive.current){setError(e.message);if([401,403,404].includes(e.status)){setItems([]);setDetail(null);setCursor(null);}}}finally{pending.current=false;if(alive.current)setBusy(false);}}
 const open=row=>act(async()=>{const r=await api.get(`/communities/${id}/review/cases/${row.id}`);if(alive.current){setDetail(r);setReason('');setMeasure('');setAck(false);}});
 const resolve=decision=>act(async()=>{
  const body={decision,motivo:reason.trim(),...(decision==='CON_MEDIDA'?{medida:measure==='SILENCIAR'?{tipo:measure,alcance:scope,duracion:silenceDuration}:measure==='BANEAR'?{tipo:measure,duracion:duration}:{tipo:measure}}:{})};
  try{const r=await api.post(`/communities/${id}/review/cases/${detail.id}/resolve`,body);if(alive.current){setDetail(r);await load();}}
  catch(e){if(e.status===409){const fresh=await api.get(`/communities/${id}/review/cases/${detail.id}`);if(alive.current){setDetail(fresh);await load();}}throw e;}
 });
 return <section className="set-card review-inbox" aria-label="Revisión humana de contenido">
  <header className="set-head"><h2>Revisión de contenido</h2><p>Los señalamientos crean casos para revisar. No eliminan mensajes ni sancionan a sus autores. Las reglas configuradas arriba también se usan en esta revisión.</p></header>
  <label><input type="checkbox" checked={active} disabled={loading||busy} onChange={e=>{const next=e.target.checked;act(async()=>{const r=await api.patch(`/communities/${id}/review/settings`,{activa:next});if(alive.current)setActive(r.revisionActiva);});}}/>Activar detección para revisión humana</label>
  <div className="review-tabs" role="group" aria-label="Estado de los casos"><Button variant="secundario" aria-pressed={tab==='PENDIENTE'} disabled={busy} onClick={()=>setTab('PENDIENTE')}>Pendientes</Button><Button variant="secundario" aria-pressed={tab==='RESUELTOS'} disabled={busy} onClick={()=>setTab('RESUELTOS')}>Resueltos</Button><Button variant="secundario" disabled={busy||loading} onClick={()=>load()}>Actualizar casos</Button></div>
  {error&&<Notice tone="error" title={error}/>}{loading&&!items.length&&<SkeletonRows rows={3} avatar={0} label="Cargando casos…"/>}
  {!loading&&!items.length&&<p>No hay casos {tab==='PENDIENTE'?'pendientes':'resueltos'}.</p>}
  <ul className="review-list">{items.map(row=><li key={row.id}><strong>Caso #{row.id} · {labels[row.estado]}</strong><span>{row.mensaje?.autor.nombreVisible??'Contenido no disponible'} · {new Date(row.fechaCreacion).toLocaleString('es-AR')}</span><p>{row.motivos.join(' · ')}</p><Button size="sm" variant="secundario" disabled={busy} onClick={()=>open(row)}>Revisar caso #{row.id}</Button></li>)}</ul>
  {cursor&&<Button variant="secundario" disabled={loading||busy} onClick={()=>load(true)}>Más casos</Button>}
  {detail&&<section className="review-detail" aria-label={`Detalle del caso ${detail.id}`}>
   <div className="plan-actions"><h3>Caso #{detail.id} · {labels[detail.estado]}</h3><Button size="sm" variant="secundario" disabled={busy} onClick={()=>setDetail(null)}>Cerrar detalle</Button></div>
   {detail.mensaje?<><p>{detail.mensaje.autor.nombreVisible} · Mensaje actual{detail.mensaje.fechaEdicion?' (editado)':''}</p><blockquote>{detail.mensaje.contenido}</blockquote></>:<Notice title="Mensaje eliminado o no disponible para tu cuenta."/>}
   <p>{detail.motivos.join(' · ')}</p>
   {detail.estado==='PENDIENTE'?<>
    <Field as="textarea" label="Motivo de la decisión" value={reason} onChange={e=>setReason(e.target.value)} maxLength={300} disabled={busy}/>
    <div className="plan-actions"><Button variant="secundario" disabled={busy||reason.trim().length<3} onClick={()=>resolve('DESCARTADO')}>Descartar señalamiento</Button><Button disabled={busy||reason.trim().length<3} onClick={()=>resolve('SIN_SANCION')}>Cerrar sin sanción</Button></div>
    {detail.mensaje&&<>
     <Field as="select" label="Iniciar una medida" value={measure} onChange={e=>{setMeasure(e.target.value);setAck(false);}} disabled={busy}><option value="">Elegí una medida</option><option value="SILENCIAR">Silenciar participación</option><option value="EXPULSAR">Expulsar de la comunidad</option><option value="BANEAR">Banear de la comunidad</option></Field>
     {measure==='SILENCIAR'&&<><Field as="select" label="Alcance del silencio" value={scope} onChange={e=>{setScope(e.target.value);setAck(false);}} disabled={busy}><option value="TEXTO">Texto</option><option value="VOZ">Voz, cámara y pantalla</option><option value="AMBOS">Texto y voz</option></Field><Field as="select" label="Duración del silencio" value={silenceDuration} onChange={e=>{setSilenceDuration(e.target.value);setAck(false);}} disabled={busy}><option value="15_MIN">15 minutos</option><option value="1_HORA">1 hora</option><option value="24_HORAS">24 horas</option><option value="7_DIAS">7 días</option><option value="PERMANENTE">Hasta levantarlo</option></Field></>}
     {measure==='BANEAR'&&<Field as="select" label="Duración del baneo" value={duration} onChange={e=>{setDuration(e.target.value);setAck(false);}} disabled={busy}><option value="30_MIN">30 minutos</option><option value="5_HORAS">5 horas</option><option value="PERMANENTE">Permanente</option></Field>}
     {measure&&<div className="plan-destructive"><p>{measure==='SILENCIAR'?`Se limitará la participación de ${detail.mensaje.autor.nombreVisible} en el alcance y duración elegidos. Conserva su membresía.`:`Se retirará a ${detail.mensaje.autor.nombreVisible} de esta comunidad y se cortará su acceso. ${measure==='BANEAR'?'No podrá reingresar mientras el baneo esté vigente.':'Podrá volver con una invitación válida.'}`} El servidor verifica tu autoridad y la jerarquía.</p><label><input type="checkbox" checked={ack} disabled={busy} onChange={e=>setAck(e.target.checked)}/>Confirmo esta medida sobre {detail.mensaje.autor.nombreVisible}</label><Button variant="peligro" disabled={busy||!ack||reason.trim().length<3} loading={busy} onClick={()=>resolve('CON_MEDIDA')}>Confirmar medida y resolver</Button></div>}
    </>}
   </>:<><p>Decidió: {detail.resolutor??'Cuenta no disponible'} · {new Date(detail.fechaResolucion).toLocaleString('es-AR')}</p><p>{detail.motivoResolucion}</p>{detail.medida&&<p>Medida: {({BANEAR:'Baneo',EXPULSAR:'Expulsión',SILENCIAR:'Silencio'})[detail.medida.tipo]}</p>}</>}
  </section>}
 </section>;
}
