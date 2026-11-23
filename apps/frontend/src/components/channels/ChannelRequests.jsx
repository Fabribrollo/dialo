import { SkeletonRows } from '../ui/Skeleton.jsx';
import {useEffect,useRef,useState} from 'react';
import {getChannelRequests,resolveChannelRequest,requestChannelAccess} from '../../services/channelsService.js';
import {useSocket} from '../../hooks/useSocket.js';
import Card from '../ui/Card.jsx';import Button from '../ui/Button.jsx';import Notice from '../ui/Notice.jsx';import EmptyState from '../ui/EmptyState.jsx';
import PermissionPills from './PermissionPills.jsx';
export function LockedChannel({canal,onChanged}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const pending=canal.solicitud==='PENDIENTE';
  return <Card><EmptyState icon="privado" title="Canal bloqueado">{canal.privado?'Solicitá acceso para que un administrador o el propietario revise tu pedido.':'Los permisos globales no permiten acceder a este canal.'}</EmptyState>
    {error&&<Notice tone="error" title={error}/>}
    {canal.privado&&<Button disabled={pending||busy} loading={busy} onClick={async()=>{if(busy)return;setBusy(true);setError('');try{await requestChannelAccess(canal.id);onChanged();}catch(e){setError(e.message);}finally{setBusy(false);}}}>{pending?'Solicitud pendiente':canal.solicitud==='RECHAZADA'?'Volver a solicitar acceso':'Solicitar acceso'}</Button>}
  </Card>;
}
export default function ChannelRequests({canal,onChanged,onCancel}) {
  const socket=useSocket();const [items,setItems]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(null),[values,setValues]=useState({});const seq=useRef(0);
  async function load(){const n=++seq.current;try{const data=await getChannelRequests(canal.id);if(n===seq.current){setItems(data.items);setError('');}}catch(e){if(n===seq.current)setError(e.message);}}
  useEffect(()=>{load();const refresh=({idComunidad})=>{if(idComunidad===canal.idComunidad)load();};socket?.on('channel:requests-changed',refresh);socket?.on('connect',load);return()=>{seq.current++;socket?.off('channel:requests-changed',refresh);socket?.off('connect',load);};},[canal.id,socket]);
  async function resolve(q,aceptar){if(busy)return;setBusy(q.id);setError('');try{await resolveChannelRequest(canal.id,q.id,{aceptar,...(aceptar?{permisos:values[q.id]??['VER']}:{})});await load();onChanged();}catch(e){if(e.status===409)await load();setError(e.message);}finally{setBusy(null);}}
  return <div className="cpa"><h2 className="dsp">Solicitudes de acceso</h2><p className="li-sub">Elegí los permisos al aceptar. Solo el propietario y los administradores pueden resolver pedidos.</p>
    {error&&<Notice tone="error" title={error} actionLabel="Reintentar" onAction={load}/>}
    {!items&&!error&&<SkeletonRows rows={2} avatar={36} action label="Cargando solicitudes…" />}
    {items?.length===0&&<EmptyState icon="privado" title="No hay solicitudes pendientes"/>}
    {items?.map(q=><Card key={q.id}><h3 className="page-h2">{q.membresia.usuario.nombreVisible}</h3><span className="li-sub">@{q.membresia.usuario.nombreUsuario}</span>
      <fieldset className="cpa-fields" disabled={busy!==null}><PermissionPills tipo={canal.tipo} label={`Permisos de ${q.membresia.usuario.nombreVisible}`} value={values[q.id]??['VER']} onChange={v=>setValues(old=>({...old,[q.id]:v}))}/>
      <div className="cpa-actions"><Button variant="secundario" onClick={()=>resolve(q,false)}>Rechazar</Button><Button disabled={!(values[q.id]??['VER']).length} onClick={()=>resolve(q,true)}>Aceptar acceso</Button></div></fieldset>
    </Card>)}
    <Button variant="secundario" onClick={onCancel}>Volver al canal</Button>
  </div>;
}
