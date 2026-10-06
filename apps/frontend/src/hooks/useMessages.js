import { useCallback, useEffect, useRef, useState } from "react";
import { useSocket } from "./useSocket.js";
import { EVENTS } from "../constants/events.js";
import { getMessages } from "../services/conversationsService.js";
import { mergeMessages, emitWithAck } from "../utils-chat.js";

export function useMessages(id) {
  const socket = useSocket();
  const [messages, setMessages] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const changes = useRef(new Map());
  const request = useRef(0);
  const loadingOlder = useRef(false);
  const reconcile = useCallback((page) => {
    return mergeMessages(
      page,
      [...changes.current.values()].filter(
        (m) => m.fechaCreacion || page.some((p) => p.id === m.id),
      ),
    );
  }, []);
  const reload = useCallback(async () => {
    const version = generation.current;
    const number = ++request.current;
    setLoading(true);
    setError("");
    try {
      const data = await getMessages(id);
      if (generation.current !== version || number !== request.current) return;
      setMessages(reconcile(data.items));
      setCursor(data.nextCursor);
    } catch (e) {
      if (generation.current === version && number === request.current)
        setError(e.message);
    } finally {
      if (generation.current === version && number === request.current)
        setLoading(false);
    }
  }, [id, reconcile]);
  useEffect(() => {
    generation.current++;
    changes.current.clear();
    setMessages([]);
    setCursor(null);
    reload();
    return () => {
      generation.current++;
      request.current++;
    };
  }, [reload]);
  useEffect(() => {
    if (!socket) return;
    const update = ({ mensaje }) => {
      if (mensaje.idConversacion !== id) return;
      const previous = changes.current.get(mensaje.id);
      const next = previous?.eliminado ? previous : mensaje;
      changes.current.set(mensaje.id, next);
      setMessages((old) => mergeMessages(old, [next]));
    };
    const remove = ({ idConversacion, idMensaje }) => {
      if (idConversacion !== id) return;
      changes.current.set(idMensaje, {
        ...changes.current.get(idMensaje),
        id: idMensaje,
        idConversacion,
        contenido: null,
        eliminado: true,
      });
      setMessages((old) =>
        old.map((m) =>
          m.id === idMensaje ? { ...m, eliminado: true, contenido: null } : m,
        ),
      );
    };
    socket.on(EVENTS.MESSAGE_NEW, update);
    socket.on(EVENTS.MESSAGE_UPDATED, update);
    socket.on(EVENTS.MESSAGE_DELETED, remove);
    socket.on("connect", reload);
    return () => {
      socket.off(EVENTS.MESSAGE_NEW, update);
      socket.off(EVENTS.MESSAGE_UPDATED, update);
      socket.off(EVENTS.MESSAGE_DELETED, remove);
      socket.off("connect", reload);
    };
  }, [socket, id, reload]);
  async function older() {
    if (!cursor || loadingOlder.current) return;
    loadingOlder.current = true;
    const version = generation.current;
    const number = request.current;
    setLoading(true);
    setError("");
    try {
      const data = await getMessages(id, cursor);
      if (version !== generation.current || number !== request.current) return;
      setMessages((old) => reconcile(mergeMessages(old, data.items)));
      setCursor(data.nextCursor);
    } catch (e) {
      if (version === generation.current && number === request.current)
        setError(e.message);
    } finally {
      loadingOlder.current = false;
      if (version === generation.current && number === request.current)
        setLoading(false);
    }
  }
  async function action(event, payload) {
    const version = generation.current;
    try {
      const result = await emitWithAck(socket, event, payload);
      if (version !== generation.current) return result;
      if (result.mensaje) {
        const m = result.mensaje;
        const previous = changes.current.get(m.id);
        const next = previous?.eliminado ? previous : m;
        changes.current.set(m.id, next);
        setMessages((old) => mergeMessages(old, [next]));
      } else if (event === EVENTS.MESSAGE_DELETE) {
        changes.current.set(payload.idMensaje, {
          id: payload.idMensaje,
          contenido: null,
          eliminado: true,
        });
        setMessages((old) =>
          old.map((m) =>
            m.id === payload.idMensaje
              ? { ...m, eliminado: true, contenido: null }
              : m,
          ),
        );
      }
      return result;
    } catch (e) {
      if (e.code === "ACK_TIMEOUT") reload();
      throw e;
    }
  }
  return { messages, loading, cursor, error, reload, older, action };
}
