import { useCallback, useEffect, useState } from "react";
import { EVENTS } from "../constants/events.js";
import * as friendsService from "../services/friendsService.js";
import { useSocket } from "./useSocket.js";
import { useAuth } from "./useAuth.js";

// Agrega o reemplaza por clave. La respuesta HTTP y el evento del socket de una misma
// accion pueden llegar los dos, y asi no se duplica nada.
function upsert(lista, item, clave) {
  return [item, ...lista.filter((x) => clave(x) !== clave(item))];
}

function ordenarAmigos(amigos) {
  return [...amigos].sort((x, y) =>
    x.usuario.nombreVisible.localeCompare(y.usuario.nombreVisible),
  );
}

export function useFriends() {
  const socket = useSocket();
  const { usuario: yo } = useAuth();
  const [amigos, setAmigos] = useState([]);
  const [recibidas, setRecibidas] = useState([]);
  const [enviadas, setEnviadas] = useState([]);
  const [estado, setEstado] = useState("cargando"); // 'cargando' | 'listo' | 'error'
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    try {
      const [listaAmigos, listaRecibidas, listaEnviadas] = await Promise.all([
        friendsService.getFriends(),
        friendsService.getRequests("recibidas"),
        friendsService.getRequests("enviadas"),
      ]);
      setAmigos(listaAmigos.items);
      setRecibidas(listaRecibidas.items);
      setEnviadas(listaEnviadas.items);
      setEstado("listo");
    } catch (e) {
      setError(e.message);
      setEstado("error");
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function agregarSolicitud(solicitud, idYo) {
    if (solicitud.receptor.id === idYo)
      setRecibidas((l) => upsert(l, solicitud, (s) => s.id));
    else setEnviadas((l) => upsert(l, solicitud, (s) => s.id));
  }

  function quitarSolicitud(idSolicitud) {
    setRecibidas((l) => l.filter((s) => s.id !== idSolicitud));
    setEnviadas((l) => l.filter((s) => s.id !== idSolicitud));
  }

  function agregarAmigo(amigo) {
    setAmigos((l) => ordenarAmigos(upsert(l, amigo, (a) => a.usuario.id)));
  }

  function quitarAmigo(idUsuario) {
    setAmigos((l) => l.filter((a) => a.usuario.id !== idUsuario));
  }

  //Cuando alguien cambia su perfil  se reemplazan sus datos en todas las listas.
  function actualizarUsuario(usuario) {
    const reemplazar = (u) => (u.id === usuario.id ? usuario : u);
    setAmigos((l) => l.map((a) => ({ ...a, usuario: reemplazar(a.usuario) })));
    const enSolicitud = (s) => ({
      ...s,
      emisor: reemplazar(s.emisor),
      receptor: reemplazar(s.receptor),
    });
    setRecibidas((l) => l.map(enSolicitud));
    setEnviadas((l) => l.map(enSolicitud));
  }

  useEffect(() => {
    if (!socket || !yo) return undefined;

    const handlers = {
      [EVENTS.FRIEND_REQUEST]: ({ solicitud }) =>
        agregarSolicitud(solicitud, yo.id),
      [EVENTS.FRIEND_ACCEPTED]: ({ idSolicitud, amigo }) => {
        quitarSolicitud(idSolicitud);
        agregarAmigo(amigo);
      },
      [EVENTS.FRIEND_REJECTED]: ({ idSolicitud }) =>
        quitarSolicitud(idSolicitud),
      [EVENTS.FRIEND_REMOVED]: ({ idUsuario }) => quitarAmigo(idUsuario),
      [EVENTS.USER_UPDATED]: ({ usuario }) => actualizarUsuario(usuario),
      // Despues de una reconexion se vuelve a pedir todo, por si se perdio algun evento.
      connect: cargar,
    };

    for (const [evento, handler] of Object.entries(handlers))
      socket.on(evento, handler);
    return () => {
      for (const [evento, handler] of Object.entries(handlers))
        socket.off(evento, handler);
    };
  }, [socket, yo?.id, cargar]);

  //relacion con otro usuario, calculada desde las listas: se actualiza sola con los eventos.
  function relacionCon(idUsuario) {
    if (amigos.some((a) => a.usuario.id === idUsuario)) return "AMIGOS";
    if (enviadas.some((s) => s.receptor.id === idUsuario))
      return "SOLICITUD_ENVIADA";
    if (recibidas.some((s) => s.emisor.id === idUsuario))
      return "SOLICITUD_RECIBIDA";
    return "NINGUNA";
  }

  return {
    estado,
    error,
    amigos,
    recibidas,
    enviadas,
    relacionCon,
    recargar: () => {
      setEstado("cargando");
      cargar();
    },
    enviar: async (idReceptor) => {
      const { solicitud } = await friendsService.sendRequest(idReceptor);
      agregarSolicitud(solicitud, yo.id);
    },
    aceptar: async (idSolicitud) => {
      const { amigo } = await friendsService.acceptRequest(idSolicitud);
      quitarSolicitud(idSolicitud);
      agregarAmigo(amigo);
    },
    rechazar: async (idSolicitud) => {
      await friendsService.rejectRequest(idSolicitud);
      quitarSolicitud(idSolicitud);
    },
    eliminar: async (idUsuario) => {
      await friendsService.removeFriend(idUsuario);
      quitarAmigo(idUsuario);
    },
  };
}
