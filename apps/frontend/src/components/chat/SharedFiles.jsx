import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api.js';
import { API_URL } from '../../constants/api.js';
export default function SharedFiles({ tipo,id,canWrite=true,onSent }) {
  const [items,setItems]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const generation=useRef(0);
  useEffect(()=>{generation.current++;setItems(null);setError('');setBusy(false);return()=>{generation.current++;};},[tipo,id]);
  async function shared(){
    const seq=generation.current;
    try {const r=await api.get(`/files/shared/${tipo}/${id}`);if(seq===generation.current){setItems(r.items);setError('');}} catch(e){if(seq===generation.current)setError(e.message);}
  }
  async function upload(event){
    const file=event.target.files[0];event.target.value='';
    if(!file||busy)return;
    if(file.size>5*1024*1024){setError('El máximo es 5 MB.');return;}
    const seq=generation.current;
    setBusy(true);setError('');
    const body=new FormData();body.append('tipo',tipo);body.append('id',String(id));body.append('archivo',file);
    try {await api.post('/files',body);if(seq===generation.current){onSent?.();if(items)shared();}} catch(e){if(seq===generation.current)setError(e.message);}finally{if(seq===generation.current)setBusy(false);}
  }
  return <section className="shared-files" aria-label="Archivos compartidos">
    {canWrite&&<label>Adjuntar PDF o imagen (máximo 5 MB)<input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" disabled={busy} onChange={upload}/></label>}
    <button type="button" onClick={shared}>Ver compartido</button>
    {error&&<p role="alert">{error}</p>}
    {busy&&<p role="status">Subiendo archivo…</p>}
    {items&&<><button onClick={()=>setItems(null)}>Cerrar compartido</button>{!items.length&&<p>No hay archivos compartidos.</p>}<ul>{items.map((m)=><li key={m.id}><a href={`${API_URL}/files/${m.adjunto.id}`} target="_blank" rel="noreferrer">{m.adjunto.nombre}</a></li>)}</ul></>}
  </section>;
}
