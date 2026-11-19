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
  return <section aria-label="Mensajes bloqueados">
    <button type="button" disabled={busy} onClick={() => load()}>Ver registro de mensajes bloqueados</button>
    {error && <p role="alert">{error}</p>}
    {busy && <p role="status">Cargando…</p>}
    {state && !state.items.length && <p>No hay mensajes bloqueados registrados.</p>}
    <ul>{state?.items.map((m) => <li key={m.id}><strong>{m.autor.nombreVisible}</strong> · <time>{new Date(m.fechaCreacion).toLocaleString()}</time><p>{m.contenido}</p><p>Motivo: {m.motivo}</p></li>)}</ul>
    {state?.nextCursor && <button type="button" disabled={busy} onClick={() => load(state.nextCursor)}>Cargar anteriores</button>}
  </section>;
}
