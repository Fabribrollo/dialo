import {useEffect,useState} from 'react';
import {api} from '../services/api.js';
import Avatar from './ui/Avatar.jsx';
import Button from './ui/Button.jsx';
import Notice from './ui/Notice.jsx';
import {SkeletonRows} from './ui/Skeleton.jsx';
import {ConfirmDialog} from './ui/Dialog.jsx';
export default function BlockedUsers(){
 const [items,setItems]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[target,setTarget]=useState(null),[busy,setBusy]=useState(false);
 useEffect(()=>{let alive=true;api.get('/features/blocked').then(r=>{if(alive)setItems(r.items);}).catch(e=>{if(alive)setError(e.message);}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[]);
 return <section className="set-card blocked-users" aria-labelledby="bloqueados-titulo">
  <header className="set-head"><h2 id="bloqueados-titulo">Usuarios bloqueados</h2><p>Al desbloquear, deberán volver a agregar su amistad para conversar.</p></header>
  {loading&&<SkeletonRows rows={2} avatar={40} action label="Cargando usuarios bloqueados…"/>}
  {error&&<Notice title={error}/>}
  {!loading&&!items.length&&!error&&<p className="set-empty">No tenés usuarios bloqueados.</p>}
  {items.length>0&&<ul className="blocked-list">{items.map(({usuario:u})=><li key={u.id}><Avatar nombre={u.nombreVisible} foto={u.fotoUrl} color={u.colorAvatar} size={40}/><span className="blocked-who"><b>{u.nombreVisible}</b><small>@{u.nombreUsuario}</small></span><Button size="sm" variant="secundario" onClick={()=>setTarget(u)}>Desbloquear</Button></li>)}</ul>}
  <ConfirmDialog open={Boolean(target)} title={`¿Desbloquear a ${target?.nombreVisible??''}?`} confirmLabel="Desbloquear" loading={busy} onCancel={()=>setTarget(null)} onConfirm={async()=>{setBusy(true);try{await api.put(`/features/people/${target.id}/block`,{bloqueado:false});setItems(old=>old.filter(x=>x.usuario.id!==target.id));setTarget(null);}catch(e){setError(e.message);}finally{setBusy(false);}}}>La amistad no se restablece automáticamente.</ConfirmDialog>
 </section>;
}
