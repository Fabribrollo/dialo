import Button from '../ui/Button.jsx';
import Icon from '../ui/Icon.jsx';
import { SkeletonRows } from '../ui/Skeleton.jsx';
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
  return <section className="set-card blocked-log" aria-label="Mensajes bloqueados">
    <div className="set-head-row"><header className="set-head"><h2>Registro de mensajes bloqueados</h2><p>Lo que la moderación frenó antes de publicarse.</p></header><Button size="sm" variant="secundario" disabled={busy} onClick={() => load()}><Icon name={state ? 'reintentar' : 'reloj'} size={15} />{state ? 'Actualizar' : 'Ver registro'}</Button></div>
    {error && <Notice title={error}/>}
    {busy && <SkeletonRows rows={3} avatar={0} label="Cargando mensajes bloqueados…" />}
    {state && !state.items.length && <p className="set-empty">No hay mensajes bloqueados registrados.</p>}
    {state?.items.length > 0 && <ul className="bl-list">{state.items.map((m) => <li key={m.id}><span className="bl-meta"><strong>{m.autor.nombreVisible}</strong><time>{new Date(m.fechaCreacion).toLocaleString('es-AR')}</time></span><p>{m.contenido}</p><span className="bl-why">Motivo: {m.motivo}</span></li>)}</ul>}
    {state?.nextCursor && <Button size="sm" variant="secundario" disabled={busy} onClick={() => load(state.nextCursor)}>Cargar anteriores</Button>}
  </section>;
}
