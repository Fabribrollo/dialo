export default function SearchResults({ search, author }) {
  if (!search.active) return null;
  return <section className="chat-search-results" aria-label="Resultados de todo el historial">
    <h3>Resultados en todo el historial</h3>
    {search.loading && <p role="status">Buscando…</p>}
    {search.error && <p role="alert">{search.error}</p>}
    {!search.loading && !search.error && !search.items.length && <p>Sin resultados.</p>}
    <ol>{search.items.map((m) => <li key={m.id}><strong>{m.autor?.nombreVisible || author?.(m) || 'Mensaje'}</strong> · <time>{new Date(m.fechaCreacion).toLocaleString()}</time><p>{m.contenido}</p></li>)}</ol>
    {search.cursor && <button type="button" disabled={search.loading} onClick={search.more}>Más resultados</button>}
  </section>;
}
