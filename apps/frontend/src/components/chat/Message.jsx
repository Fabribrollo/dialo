import { useState } from "react";
import Avatar from "../Avatar.jsx";
export default function Message({
  mensaje,
  autor,
  own,
  onEdit,
  onDelete,
  connected,
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onEdit(mensaje.id, text);
      setEditing(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className={`message ${own ? "own" : ""}`}>
      <Avatar usuario={autor} />
      <div className="message-body">
        <div className="message-meta">
          <strong>{autor.nombreVisible}</strong>
          <span>@{autor.nombreUsuario}</span>
          <time
            dateTime={mensaje.fechaCreacion}
            title={new Date(mensaje.fechaCreacion).toLocaleString("es-AR")}
          >
            {new Date(mensaje.fechaCreacion).toLocaleTimeString("es-AR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        </div>
        {mensaje.eliminado ? (
          <p className="message-deleted">Mensaje eliminado</p>
        ) : editing ? (
          <form onSubmit={save} className="message-edit">
            <label className="sr-only" htmlFor={`editar-${mensaje.id}`}>
              Editar mensaje
            </label>
            <textarea
              id={`editar-${mensaje.id}`}
              autoFocus
              value={text}
              maxLength={2000}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditing(false);
              }}
            />
            <div>
              <button disabled={busy || !connected || !text.trim()}>
                Guardar
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setEditing(false)}
              >
                Cancelar
              </button>
            </div>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
          </form>
        ) : (
          <p className="message-text">{mensaje.contenido}</p>
        )}
        {mensaje.fechaEdicion && !mensaje.eliminado && (
          <small className="edited">editado</small>
        )}
        {own && !mensaje.eliminado && !editing && (
          <div className="message-actions">
            <button
              type="button"
              className="text-button"
              disabled={!connected}
              onClick={() => {
                setText(mensaje.contenido);
                setEditing(true);
              }}
              aria-label={`Editar mensaje de ${new Date(mensaje.fechaCreacion).toLocaleString("es-AR")}`}
            >
              Editar
            </button>
            <button
              type="button"
              className="text-button danger"
              disabled={!connected}
              onClick={() => onDelete(mensaje.id)}
              aria-label={`Eliminar mensaje de ${new Date(mensaje.fechaCreacion).toLocaleString("es-AR")}`}
            >
              Eliminar
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
