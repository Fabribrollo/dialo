import Notice from '../ui/Notice.jsx';
import { useState } from 'react';
import { api } from '../../services/api.js';
export default function BlockedMessages({ id }) {
  const [state, setState] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function load(cursor) {
    if (busy) return; setBusy(true); setError('');
    try {
      const result = await api.get(`/communities/${id}/moderation/blocked${cursor ? '?cursor=' + cursor : ''}`);
      setState((s) => ({ ...result, items: cursor ? [...s.items, ...result.items] : result.items }));
    } catch (e) { setState(null); setError(e.message); } finally { setBusy(false); }
  }
  return <section className="lg blocked-log" aria-label="Mensajes bloqueados">
    <div className="bl-head"><b>Registro de mensajes bloqueados</b><button type="button" className="pr" disabled={busy} onClick={() => load()}>{state ? 'Actualizar' : 'Ver registro'}</button></div>
    {error && <Notice title={error}/>}
    {busy && <p role="status">Cargando…</p>}
    {state && !state.items.length && <p>No hay mensajes bloqueados registrados.</p>}
    {state?.items.length > 0 && <ul className="bl-list">{state.items.map((m) => <li key={m.id}><span className="bl-meta"><strong>{m.autor.nombreVisible}</strong><time>{new Date(m.fechaCreacion).toLocaleString('es-AR')}</time></span><p>{m.contenido}</p><span className="bl-why">Motivo: {m.motivo}</span></li>)}</ul>}
    {state?.nextCursor && <button type="button" disabled={busy} onClick={() => load(state.nextCursor)}>Cargar anteriores</button>}
  </section>;
}
