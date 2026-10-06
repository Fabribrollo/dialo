import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, NavLink, useParams } from "react-router";
import { useAuth } from "../hooks/useAuth.js";
import { useMessages } from "../hooks/useMessages.js";
import { useConversations } from "../context/ConversationsContext.jsx";
import { getConversation } from "../services/conversationsService.js";
import { EVENTS } from "../constants/events.js";
import Avatar, { statusNames } from "../components/Avatar.jsx";
import Icon from "../components/Icon.jsx";
import Message from "../components/chat/Message.jsx";
import DeleteDialog from "../components/chat/DeleteDialog.jsx";

function Chat({ id, draft, setDraft }) {
  const { usuario, refresh } = useAuth();
  const {
    items,
    remember,
    reload: reloadList,
    connected,
    getRevision,
  } = useConversations();
  const chat = items.find((c) => c.id === id);
  const history = useMessages(id);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [missing, setMissing] = useState("");
  const [retry, setRetry] = useState(0);
  const viewport = useRef(null);
  const anchor = useRef(null);
  const stick = useRef(true);

  useEffect(() => {
    let active = true;
    setMissing("");
    const version = getRevision();
    getConversation(id)
      .then(({ conversacion }) => {
        if (active) remember(conversacion, version);
      })
      .catch((e) => {
        if (active) setMissing(e.message);
      });
    return () => {
      active = false;
    };
  }, [id, remember, retry, getRevision]);
  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node) return;
    if (anchor.current) {
      node.scrollTop =
        anchor.current.top + node.scrollHeight - anchor.current.height;
      anchor.current = null;
    } else if (stick.current) node.scrollTop = node.scrollHeight;
  }, [history.messages]);
  async function action(event, payload) {
    try {
      const result = await history.action(event, payload);
      reloadList();
      return result;
    } catch (e) {
      if (e.code === "UNAUTHORIZED") refresh();
      if (e.code === "NOT_FRIENDS") reloadList();
      throw e;
    }
  }
  async function send(e) {
    e?.preventDefault();
    if (!draft.trim() || sending || !chat?.puedeEscribir || !connected) return;
    const content = draft;
    setSending(true);
    setError("");
    try {
      await action(EVENTS.MESSAGE_SEND, {
        idConversacion: id,
        contenido: content,
      });
      setDraft((current) => (current === content ? "" : current));
      stick.current = true;
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }
  if (missing)
    return (
      <div className="empty-state">
        <Icon name="chat" />
        <h2>No pudimos abrir el chat</h2>
        <p role="alert">{missing}</p>
        <button onClick={() => setRetry((n) => n + 1)}>Reintentar</button>
        <Link to="/">Volver a conversaciones</Link>
      </div>
    );
  if (!chat)
    return (
      <div className="empty-state" role="status">
        Abriendo conversación…
      </div>
    );
  let lastDay = "";
  return (
    <section
      className="chat-pane"
      aria-label={`Chat con ${chat.otroUsuario.nombreVisible}`}
    >
      <header className="chat-header">
        <Link
          to="/"
          className="back-chat icon-button"
          aria-label="Volver a conversaciones"
        >
          <Icon name="arrow" />
        </Link>
        <Avatar usuario={chat.otroUsuario} />
        <div>
          <h1>{chat.otroUsuario.nombreVisible}</h1>
          <p>
            @{chat.otroUsuario.nombreUsuario}{" "}
            <span>· {statusNames[chat.otroUsuario.disponibilidad]}</span>
          </p>
        </div>
        <span className="private-badge">Conversación privada</span>
      </header>
      {!connected && (
        <p className="notice" role="status">
          Sin conexión en tiempo real. Tu texto se conserva; reconectaremos
          automáticamente.
        </p>
      )}
      {!chat.puedeEscribir && (
        <p className="notice">
          Ya no son amigos. Podés consultar el historial; agregá de nuevo a esta
          persona para enviar mensajes.
        </p>
      )}
      {history.error && (
        <p role="alert" className="notice error">
          {history.error}{" "}
          <button className="text-button" onClick={history.reload}>
            Reintentar
          </button>
        </p>
      )}
      <div
        className="message-scroll"
        ref={viewport}
        onScroll={(e) => {
          const n = e.currentTarget;
          stick.current = n.scrollHeight - n.scrollTop - n.clientHeight < 90;
        }}
      >
        {history.cursor && (
          <button
            className="load-older secondary"
            disabled={history.loading}
            onClick={async () => {
              const n = viewport.current;
              anchor.current = { top: n.scrollTop, height: n.scrollHeight };
              await history.older();
            }}
          >
            {history.loading ? "Cargando…" : "Cargar mensajes anteriores"}
          </button>
        )}
        {history.loading && !history.messages.length && (
          <p role="status" className="center-note">
            Cargando mensajes…
          </p>
        )}
        {!history.loading && !history.error && !history.messages.length && (
          <div className="chat-start">
            <Avatar usuario={chat.otroUsuario} size="large" />
            <h2>Sin mensajes</h2>
            <p>
              Conversación con{" "}
              <strong>{chat.otroUsuario.nombreVisible}</strong>.<br />
              Todavía no hay mensajes en este chat.
            </p>
          </div>
        )}
        <ol className="messages" aria-label="Historial de mensajes">
          {history.messages.map((m) => {
            const day = new Date(m.fechaCreacion).toLocaleDateString("es-AR", {
              day: "numeric",
              month: "long",
              year: "numeric",
            });
            const divider = day !== lastDay;
            lastDay = day;
            return (
              <li key={m.id} className="message-group">
                {divider && <div className="date-divider">{day}</div>}
                <ol>
                  <Message
                    mensaje={m}
                    autor={
                      m.idAutor === usuario.id ? usuario : chat.otroUsuario
                    }
                    own={m.idAutor === usuario.id}
                    connected={connected}
                    onEdit={(idMensaje, contenido) =>
                      action(EVENTS.MESSAGE_EDIT, { idMensaje, contenido })
                    }
                    onDelete={setDeleting}
                  />
                </ol>
              </li>
            );
          })}
        </ol>
      </div>
      <form className="composer" onSubmit={send}>
        <label className="sr-only" htmlFor="nuevo-mensaje">
          Mensaje para {chat.otroUsuario.nombreVisible}
        </label>
        <div className="composer-field">
          <textarea
            id="nuevo-mensaje"
            rows={2}
            maxLength={2000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              chat.puedeEscribir
                ? `Escribile a ${chat.otroUsuario.nombreVisible}…`
                : "El envío está deshabilitado"
            }
            disabled={!chat.puedeEscribir}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button
            type="submit"
            aria-label="Enviar mensaje"
            disabled={
              sending || !connected || !chat.puedeEscribir || !draft.trim()
            }
          >
            <Icon name="send" />
          </button>
        </div>
        <div className="composer-hint">
          <span>Enter para enviar · Shift + Enter para una nueva línea</span>
          <span>{draft.length}/2000</span>
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </form>
      {deleting !== null && (
        <DeleteDialog
          onClose={() => setDeleting(null)}
          onConfirm={() =>
            action(EVENTS.MESSAGE_DELETE, { idMensaje: deleting })
          }
        />
      )}
    </section>
  );
}
export default function ConversationsPage() {
  const { id } = useParams();
  const selected = id ? Number(id) : null;
  const { items, error, loading, reload } = useConversations();
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState({});
  const valid =
    selected &&
    Number.isInteger(selected) &&
    selected > 0 &&
    selected <= 2147483647;
  return (
    <div
      className={`conversations-layout ${valid ? "has-chat" : id ? "invalid-chat" : ""}`}
    >
      <aside
        className="conversation-sidebar"
        aria-label="Lista de conversaciones"
      >
        <div className="sidebar-title">
          <h1>
            Conversaciones<span>{items.length}</span>
          </h1>
          <p>Mensajes privados</p>
        </div>
        <label className="sr-only" htmlFor="filtrar-chats">
          Buscar conversación
        </label>
        <input
          id="filtrar-chats"
          type="search"
          placeholder="Buscar una conversación…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {loading && (
          <p className="center-note" role="status">
            Cargando conversaciones…
          </p>
        )}
        {error && (
          <p role="alert" className="notice error">
            {error}
            <button onClick={reload}>Reintentar</button>
          </p>
        )}
        <nav aria-label="Conversaciones privadas">
          {items
            .filter((c) =>
              `${c.otroUsuario.nombreVisible} ${c.otroUsuario.nombreUsuario}`
                .toLowerCase()
                .includes(search.toLowerCase()),
            )
            .map((c) => (
              <NavLink
                key={c.id}
                to={`/conversaciones/${c.id}`}
                className="conversation-item"
              >
                <Avatar usuario={c.otroUsuario} />
                <span>
                  <strong>{c.otroUsuario.nombreVisible}</strong>
                  <small>
                    {c.ultimoMensaje?.eliminado
                      ? "Mensaje eliminado"
                      : c.ultimoMensaje?.contenido || "Sin mensajes"}
                  </small>
                </span>
                {c.ultimoMensaje && (
                  <time>
                    {new Date(c.ultimoMensaje.fechaCreacion).toLocaleTimeString(
                      "es-AR",
                      { hour: "2-digit", minute: "2-digit" },
                    )}
                  </time>
                )}
              </NavLink>
            ))}
        </nav>
        {!loading && !items.length && (
          <p className="sidebar-empty">
            No tenés conversaciones. Para abrir un chat, seleccioná un amigo.
          </p>
        )}
        {search &&
          !items.some((c) =>
            `${c.otroUsuario.nombreVisible} ${c.otroUsuario.nombreUsuario}`
              .toLowerCase()
              .includes(search.toLowerCase()),
          ) && (
            <p className="sidebar-empty">No encontramos esa conversación.</p>
          )}
        <Link className="new-chat secondary" to="/amigos">
          <Icon name="people" /> Ver amigos
        </Link>
      </aside>
      {valid ? (
        <Chat
          key={selected}
          id={selected}
          draft={drafts[selected] || ""}
          setDraft={(value) =>
            setDrafts((old) => ({
              ...old,
              [selected]:
                typeof value === "function"
                  ? value(old[selected] || "")
                  : value,
            }))
          }
        />
      ) : (
        <section className="empty-state">
          <div className="empty-orbit">
            <Icon name="chat" />
          </div>
          <h2>
            {id ? "Conversación inválida" : "Seleccioná una conversación"}
          </h2>
          <p>
            Abrí un chat desde la lista o desde Amigos.
          </p>
          <Link className="button-link" to="/amigos">
            Ver amigos <Icon name="people" />
          </Link>
        </section>
      )}
    </div>
  );
}
