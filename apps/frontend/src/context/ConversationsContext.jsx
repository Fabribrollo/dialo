import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSocket } from "../hooks/useSocket.js";
import { useAuth } from "../hooks/useAuth.js";
import { EVENTS } from "../constants/events.js";
import { getMe } from "../services/authService.js";
import * as service from "../services/conversationsService.js";
import { sortConversations } from "../utils-chat.js";

const Context = createContext(null);
export const useConversations = () => useContext(Context);
export function ConversationsProvider({ children }) {
  const socket = useSocket();
  const { usuario, setUsuario, refresh } = useAuth();
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(Boolean(socket?.connected));
  const revision = useRef(0);
  const request = useRef(0);
  const reload = useCallback(async () => {
    const number = ++request.current;
    const version = revision.current;
    try {
      const data = await service.getConversations();
      if (number !== request.current) return;
      if (version !== revision.current) return reload();
      setItems(sortConversations(data.items));
      setError("");
    } catch (e) {
      if (number === request.current) setError(e.message);
    } finally {
      if (number === request.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    reload();
    return () => {
      request.current++;
    };
  }, [reload]);
  const getRevision = useCallback(() => revision.current, []);
  const remember = useCallback((conversation, expectedRevision) => {
    if (expectedRevision !== undefined && expectedRevision !== revision.current)
      return;
    revision.current++;
    setItems((old) =>
      sortConversations([
        conversation,
        ...old.filter((c) => c.id !== conversation.id),
      ]),
    );
  }, []);
  useEffect(() => {
    if (!socket) {
      setConnected(false);
      return;
    }
    let active = true;
    setConnected(socket.connected);
    const changeMessage = ({ mensaje }) => {
      revision.current++;
      setItems((old) =>
        sortConversations(
          old.map((c) => {
            if (c.id !== mensaje.idConversacion) return c;
            const last = c.ultimoMensaje;
            const newer =
              !last ||
              new Date(mensaje.fechaCreacion) > new Date(last.fechaCreacion) ||
              (mensaje.fechaCreacion === last.fechaCreacion &&
                mensaje.id >= last.id);
            return newer
              ? {
                  ...c,
                  ultimoMensaje:
                    last?.id === mensaje.id
                      ? {
                          ...mensaje,
                          ...(last.eliminado && {
                            eliminado: true,
                            contenido: null,
                          }),
                        }
                      : mensaje,
                }
              : c;
          }),
        ),
      );
    };
    const handlers = {
      connect: () => {
        setConnected(true);
        reload();
      },
      disconnect: (reason) => {
        setConnected(false);
        if (reason === "io server disconnect") refresh();
      },
      connect_error: (error) => {
        setConnected(false);
        if (error.data?.code === "UNAUTHORIZED") refresh();
      },
      [EVENTS.CONVERSATION_NEW]: ({ conversacion }) => remember(conversacion),
      [EVENTS.MESSAGE_NEW]: changeMessage,
      [EVENTS.MESSAGE_UPDATED]: changeMessage,
      [EVENTS.MESSAGE_DELETED]: ({ idConversacion, idMensaje }) => {
        revision.current++;
        setItems((old) =>
          old.map((c) =>
            c.id === idConversacion && c.ultimoMensaje?.id === idMensaje
              ? {
                  ...c,
                  ultimoMensaje: {
                    ...c.ultimoMensaje,
                    eliminado: true,
                    contenido: null,
                  },
                }
              : c,
          ),
        );
      },
      [EVENTS.FRIEND_REMOVED]: ({ idUsuario }) => {
        revision.current++;
        setItems((old) =>
          old.map((c) =>
            c.otroUsuario.id === idUsuario ? { ...c, puedeEscribir: false } : c,
          ),
        );
      },
      [EVENTS.FRIEND_ACCEPTED]: reload,
      [EVENTS.USER_UPDATED]: ({ usuario: updated }) => {
        revision.current++;
        setItems((old) =>
          old.map((c) =>
            c.otroUsuario.id === updated.id
              ? { ...c, otroUsuario: updated }
              : c,
          ),
        );
        if (updated.id === usuario.id) {
          // El evento público oculta disponibilidad INVISIBLE. Reconsultar el
          // perfil propio evita mostrar ese estado público en otra pestaña.
          getMe()
            .then((data) => {
              if (active) setUsuario(data.usuario);
            })
            .catch(() => {});
        }
      },
    };
    Object.entries(handlers).forEach(([name, fn]) => socket.on(name, fn));
    return () => {
      active = false;
      Object.entries(handlers).forEach(([name, fn]) => socket.off(name, fn));
    };
  }, [socket, usuario.id, remember, reload, setUsuario, refresh]);
  return (
    <Context.Provider
      value={{
        items,
        error,
        loading,
        reload,
        remember,
        connected,
        getRevision,
      }}
    >
      {children}
    </Context.Provider>
  );
}
