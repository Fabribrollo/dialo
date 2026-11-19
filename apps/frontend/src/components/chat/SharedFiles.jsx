import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api.js';
import { API_URL } from '../../constants/api.js';
import Icon, { Spinner } from '../ui/Icon.jsx';
import './sharedFiles.css';

export default function SharedFiles({ tipo, id, canWrite = true, onSent }) {
  const [items, setItems] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [cargando, setCargando] = useState(false);
  const generation = useRef(0);
  useEffect(() => { generation.current++; setItems(null); setError(''); setBusy(false); return () => { generation.current++; }; }, [tipo, id]);
  async function shared() {
    const seq = generation.current;
    setCargando(true);
    try { const r = await api.get(`/files/shared/${tipo}/${id}`); if (seq === generation.current) { setItems(r.items); setError(''); } }
    catch (e) { if (seq === generation.current) setError(e.message); }
    finally { if (seq === generation.current) setCargando(false); }
  }
  async function upload(event) {
    const file = event.target.files[0]; event.target.value = '';
    if (!file || busy) return;
    if (file.size > 5 * 1024 * 1024) { setError('El archivo pesa más de 5 MB. Elegí uno más liviano.'); return; }
    const seq = generation.current;
    setBusy(true); setError('');
    const body = new FormData(); body.append('tipo', tipo); body.append('id', String(id)); body.append('archivo', file);
    try { await api.post('/files', body); if (seq === generation.current) { onSent?.(); if (items) shared(); } }
    catch (e) { if (seq === generation.current) setError(e.message); }
    finally { if (seq === generation.current) setBusy(false); }
  }
  return <section className="shared-files" aria-label="Archivos compartidos">
    {canWrite && <label className={`pr sf-btn ${busy ? 'is-busy' : ''}`}>
      {busy ? <Spinner size={15} /> : <Icon name="subir" size={15} stroke={2.2} />}
      {busy ? 'Subiendo…' : 'Adjuntar'}<span className="sr-only"> PDF o imagen (máximo 5 MB)</span>
      <input type="file" className="sr-only" accept=".pdf,.png,.jpg,.jpeg,.webp" disabled={busy} onChange={upload} />
    </label>}
    <button type="button" className="pr sf-btn" aria-expanded={Boolean(items)} onClick={items ? () => setItems(null) : shared} disabled={cargando}>
      {cargando ? <Spinner size={15} /> : <Icon name="enlace" size={15} stroke={2.2} />}Ver compartido
    </button>
    {error && <p className="sf-error" role="alert">{error}</p>}
    {items && <div className="lg sf-panel">
      <div className="sf-head"><b>Compartido</b><button type="button" className="sf-close" onClick={() => setItems(null)} aria-label="Cerrar compartido"><Icon name="cerrar" size={15} stroke={2.2} /></button></div>
      {!items.length ? <p className="sf-empty">No hay archivos compartidos.</p> : <ul className="sf-list">{items.map((m) => <li key={m.id}>
        <a className="sf-file" href={`${API_URL}/files/${m.adjunto.id}`} target="_blank" rel="noreferrer">
          <span className="sf-ic" aria-hidden="true">{/\.pdf$/i.test(m.adjunto.nombre) ? 'PDF' : 'IMG'}</span>
          <span className="sf-name">{m.adjunto.nombre}</span>
        </a>
      </li>)}</ul>}
    </div>}
  </section>;
}
