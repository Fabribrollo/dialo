import { prisma } from "../prisma/client.js";
import { emitToUser } from "../sockets/emitter.js";
import { EVENTS } from "../sockets/events.js";
import { AppError } from "../utils/AppError.js";
import { toUsuarioPublico, usuarioPublicoSelect } from "../utils/selects.js";

//Datos que se traen en una solicitud: solo datos publicos.
const solicitudSelect = {
  id: true,
  estado: true,
  fechaCreacion: true,
  emisor: { select: usuarioPublicoSelect },
  receptor: { select: usuarioPublicoSelect },
};

// Arma la forma "Solicitud" del contrato
function toSolicitud({ emisor, receptor, ...solicitud }) {
  return {
    ...solicitud,
    emisor: toUsuarioPublico(emisor),
    receptor: toUsuarioPublico(receptor),
  };
}

// La tabla amistad guarda cada par con el id menor en A (CHECK amistad_par_ordenado).
// Asi una amistad entre 3 y 7 siempre es { A: 3, B: 7 }, se pregunte en el orden que se pregunte.
function parOrdenado(idA, idB) {
  return idA < idB
    ? { idUsuarioA: idA, idUsuarioB: idB }
    : { idUsuarioA: idB, idUsuarioB: idA };
}

//Si dos usuarios son amigos
// la usan las conversaciones privadas, antes de crear una conversacion o enviar un mensaje
export async function areFriends(idUsuarioA, idUsuarioB) {
  if (idUsuarioA === idUsuarioB) return false;
  const amistad = await prisma.amistad.findUnique({
    where: { idUsuarioA_idUsuarioB: parOrdenado(idUsuarioA, idUsuarioB) },
    select: { idUsuarioA: true },
  });
  return Boolean(amistad);
}

//Retorna los id de los amigos del usuario.
export async function getFriendIds(idUsuario) {
  const amistades = await prisma.amistad.findMany({
    //El usuario puede estan en A o B, se busca en las dos posiciones.
    where: { OR: [{ idUsuarioA: idUsuario }, { idUsuarioB: idUsuario }] },
  });
  // De cada par se queda con el otro usuario.
  return amistades.map((a) =>
    a.idUsuarioA === idUsuario ? a.idUsuarioB : a.idUsuarioA,
  );
}

//Get /api/users/search
//busca usuarios por nombre de usuario o nombre visible e indica al relac.
export async function searchUsers(idUsuario, q, limit) {
  const usuarios = await prisma.usuario.findMany({
    where: {
      id: { not: idUsuario },
      OR: [
        { nombreUsuario: { contains: q, mode: "insensitive" } },
        { nombreVisible: { contains: q, mode: "insensitive" } },
      ],
    },
    select: usuarioPublicoSelect,
    orderBy: { nombreVisible: "asc" },
    take: limit,
  });

  // 2. Amistades y solicitudes pendientes entre el que busca y los resultados.
  // Son dos consultas en total, no dos por cada usuario encontrado.
  const ids = usuarios.map((u) => u.id);
  const [amistades, solicitudes] = await Promise.all([
    prisma.amistad.findMany({
      where: {
        OR: [
          { idUsuarioA: idUsuario, idUsuarioB: { in: ids } },
          { idUsuarioB: idUsuario, idUsuarioA: { in: ids } },
        ],
      },
    }),
    prisma.solicitudAmistad.findMany({
      where: {
        estado: "PENDIENTE",
        OR: [
          { idEmisor: idUsuario, idReceptor: { in: ids } },
          { idReceptor: idUsuario, idEmisor: { in: ids } },
        ],
      },
      select: { idEmisor: true, idReceptor: true },
    }),
  ]);

  // 3. Mapa de id del otro usuario a su relacion con el que busca.
  const relaciones = new Map();
  for (const s of solicitudes) {
    const enviada = s.idEmisor === idUsuario;
    relaciones.set(
      enviada ? s.idReceptor : s.idEmisor,
      enviada ? "SOLICITUD_ENVIADA" : "SOLICITUD_RECIBIDA",
    );
  }

  // Las amistades se cargan después, asi  que si hubiera ambas cosas, AMIGOS tiene prioridad.
  for (const a of amistades)
    relaciones.set(
      a.idUsuarioA === idUsuario ? a.idUsuarioB : a.idUsuarioA,
      "AMIGOS",
    );

  // 4. Cada resultado con su relacio; si no tiene ninguna, NINGUNA.
  return usuarios.map((u) => ({
    usuario: toUsuarioPublico(u),
    relacion: relaciones.get(u.id) ?? "NINGUNA",
  }));
}

// POST /api/friends/requests
// Crea una solicitud de amistad pendiente. El emisor sale de la sesión, nunca del body.
export async function sendRequest(idEmisor, idReceptor) {
  // No se puede enviar una solicitud a uno mismo.
  if (idEmisor === idReceptor) {
    throw new AppError(
      400,
      "SELF_REQUEST",
      "No podés enviarte una solicitud a vos mismo",
    );
  }

  // El receptor tiene que existir.
  const receptor = await prisma.usuario.findUnique({
    where: { id: idReceptor },
    select: { id: true },
  });
  if (!receptor)
    throw new AppError(404, "USER_NOT_FOUND", "El usuario no existe");

  // No pueden ser amigos ya.
  if (await areFriends(idEmisor, idReceptor))
    throw new AppError(409, "ALREADY_FRIENDS", "Ya son amigos");

  // No puede haber otra pendiente entre los dos, en ninguna direccion.
  // Las rechazadas no cuentan, asi que despues de un rechazo se puede volver a solicitar.
  const pendiente = await prisma.solicitudAmistad.findFirst({
    where: {
      estado: "PENDIENTE",
      OR: [
        { idEmisor, idReceptor },
        { idEmisor: idReceptor, idReceptor: idEmisor },
      ],
    },
    select: { id: true },
  });
  if (pendiente)
    throw new AppError(
      409,
      "REQUEST_EXISTS",
      "Ya hay una solicitud pendiente entre ustedes",
    );

  // Si llegan dos solicitudes al mismo tiempo, las dos pueden pasar el chequeo anterior.
  // En ese caso el índice unico solicitud_pendiente_unica rechaza la segunda,
  // y el errorHandler la convierte en 409 REQUEST_EXISTS.
  const solicitud = toSolicitud(
    await prisma.solicitudAmistad.create({
      data: { idEmisor, idReceptor },
      select: solicitudSelect,
    }),
  );

  // Aviso en tiempo real a los dos, para que aparezca en "enviadas" y en "recibidas".
  for (const id of [idEmisor, idReceptor])
    emitToUser(id, EVENTS.FRIEND_REQUEST, { solicitud });
  return solicitud;
}
