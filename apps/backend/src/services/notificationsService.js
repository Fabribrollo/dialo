import { prisma } from '../prisma/client.js';
import { channelSelect, effectiveChannelPermissions, memberRoleIds, memberSelect } from '../utils/channelPermissions.js';
import { emitToUser } from '../sockets/emitter.js';

const PAGE = 30;

// Destinos que cada usuario tiene abiertos y enfocados, indexados por usuario.
const watching = new Map();
const sockets = new Map();

export function watchActivity(socket, scope) {
  clearActivity(socket);
  if (!scope || socket.connected === false) return;
  const user = socket.data.user.id;
  if (!watching.has(user)) watching.set(user, new Map());
  watching.get(user).set(socket.id, scope);
  sockets.set(socket.id, user);
}

export function clearActivity(socket) {
  const user = sockets.get(socket.id);
  if (user === undefined) return;
  sockets.delete(socket.id);
  const scopes = watching.get(user);
  scopes?.delete(socket.id);
  if (scopes && !scopes.size) watching.delete(user);
}

function isWatching(user, tipo, referencia) {
  const scopes = watching.get(user);
  if (!scopes) return false;
  for (const s of scopes.values()) if (s.tipo === tipo && s.referencia === referencia) return true;
  return false;
}

// Crea el mismo aviso para varios destinatarios con dos consultas en total.
export async function notifyMany(users, tipo, referencia, origen) {
  const pending = [...new Set(users)].filter((user) => !isWatching(user, tipo, referencia));
  if (!pending.length) return;
  const owners = await prisma.usuario.findMany({ where: { id: { in: pending } }, select: { id: true, preferencias: true } });
  const targets = owners.filter((o) => !o.preferencias?.silenciarNotificaciones).map((o) => o.id);
  if (!targets.length) return;
  const created = await prisma.notificacion.createManyAndReturn({
    data: targets.map((idUsuario) => ({ idUsuario, tipo, referencia, origen })),
    skipDuplicates: true,
    select: { idUsuario: true },
  });
  for (const { idUsuario } of created) emitToUser(idUsuario, 'notifications:changed', {});
}

export const notify = (user, tipo, referencia, origen) => notifyMany([user], tipo, referencia, origen);

export async function notifyChannelMessage(idCanal, actor, messageId) {
  // Canal e integrantes en la misma instantánea: los permisos se calculan en memoria.
  const recipients = await prisma.$transaction(async (tx) => {
    const canal = await tx.canal.findUnique({ where: { id: idCanal }, select: channelSelect });
    if (!canal) return [];
    const members = await tx.membresia.findMany({
      where: { idComunidad: canal.idComunidad, idUsuario: { not: actor } },
      select: memberSelect,
    });
    return members
      .filter((m) => effectiveChannelPermissions(canal, m.rol, m.idUsuario, memberRoleIds(m)).includes('VER'))
      .map((m) => m.idUsuario);
  }, { isolationLevel: 'RepeatableRead' });
  await notifyMany(recipients, 'canal', idCanal, `mensaje:${messageId}`);
}

// Resuelve en lote qué destinos sigue viendo el usuario y con qué nombre mostrarlos.
async function visibleDestinations(user) {
  const refs = await prisma.notificacion.findMany({
    where: { idUsuario: user }, distinct: ['tipo', 'referencia'], select: { tipo: true, referencia: true },
  });
  const ids = { canal: [], conversacion: [], amistad: [] };
  for (const r of refs) ids[r.tipo]?.push(r.referencia);

  const [canales, conversaciones, solicitudes] = await Promise.all([
    ids.canal.length ? prisma.canal.findMany({
      where: { id: { in: ids.canal } },
      select: { ...channelSelect, comunidad: { select: { nombre: true, moderacionActiva: true } } },
    }) : [],
    ids.conversacion.length ? prisma.conversacionPrivada.findMany({
      where: { id: { in: ids.conversacion }, OR: [{ idUsuarioA: user }, { idUsuarioB: user }] },
      select: {
        id: true, idUsuarioA: true,
        usuarioA: { select: { nombreVisible: true, fotoUrl: true } },
        usuarioB: { select: { nombreVisible: true, fotoUrl: true } },
      },
    }) : [],
    ids.amistad.length ? prisma.solicitudAmistad.findMany({
      where: { id: { in: ids.amistad }, idReceptor: user, estado: 'PENDIENTE' },
      select: { id: true, emisor: { select: { nombreVisible: true, fotoUrl: true } } },
    }) : [],
  ]);

  const memberships = canales.length ? await prisma.membresia.findMany({
    where: { idUsuario: user, idComunidad: { in: [...new Set(canales.map((c) => c.idComunidad))] } },
    select: { idComunidad: true, ...memberSelect },
  }) : [];
  const byCommunity = new Map(memberships.map((m) => [m.idComunidad, m]));

  const context = new Map();
  for (const c of canales) {
    const m = byCommunity.get(c.idComunidad);
    if (!effectiveChannelPermissions(c, m?.rol, user, memberRoleIds(m)).includes('VER')) continue;
    context.set(`canal:${c.id}`, { nombre: c.nombre, comunidad: c.comunidad.nombre, idComunidad: c.idComunidad });
  }
  for (const c of conversaciones) {
    const otro = c.idUsuarioA === user ? c.usuarioB : c.usuarioA;
    context.set(`conversacion:${c.id}`, { nombre: otro.nombreVisible, fotoUrl: otro.fotoUrl });
  }
  for (const s of solicitudes) context.set(`amistad:${s.id}`, { nombre: s.emisor.nombreVisible, fotoUrl: s.emisor.fotoUrl });

  const allowed = [...context.keys()].map((key) => {
    const [tipo, referencia] = key.split(':');
    return { tipo, referencia: Number(referencia) };
  });
  return { where: { idUsuario: user, OR: allowed }, context };
}

// Texto corto del mensaje que generó cada aviso, en una sola consulta por página.
async function messagePreviews(items) {
  const ids = items.map((n) => /^mensaje:(\d+)$/.exec(n.origen)?.[1]).filter(Boolean).map(Number);
  if (!ids.length) return new Map();
  const rows = await prisma.mensaje.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, idCanal: true, idConversacion: true, contenido: true, fechaEliminacion: true,
      autor: { select: { nombreVisible: true } }, adjunto: { select: { id: true } },
    },
  });
  const byId = new Map(rows.map((m) => [m.id, m]));
  const result = new Map();
  for (const n of items) {
    const m = byId.get(Number(/^mensaje:(\d+)$/.exec(n.origen)?.[1]));
    if (!m || (n.tipo === 'canal' ? m.idCanal : m.idConversacion) !== n.referencia) continue;
    const texto = m.fechaEliminacion ? 'Este mensaje se eliminó' : m.contenido.trim() ? m.contenido.slice(0, 140) : m.adjunto ? 'Mandó un archivo' : '';
    result.set(n.origen, { autor: m.autor.nombreVisible, texto });
  }
  return result;
}

export async function listNotifications(user, cursor) {
  const { where, context } = await visibleDestinations(user);
  const [items, unread] = await Promise.all([
    prisma.notificacion.findMany({
      where: { ...where, ...(cursor ? { id: { lt: cursor } } : {}) },
      orderBy: { id: 'desc' }, take: PAGE + 1,
      select: { id: true, tipo: true, referencia: true, origen: true, leida: true, fechaCreacion: true },
    }),
    prisma.notificacion.count({ where: { ...where, leida: false } }),
  ]);
  const page = items.slice(0, PAGE);
  const previews = await messagePreviews(page);
  return {
    items: page.map(({ origen, ...n }) => ({ ...n, contexto: context.get(`${n.tipo}:${n.referencia}`), vista: previews.get(origen) })),
    noLeidas: unread,
    nextCursor: items.length > PAGE ? items[PAGE - 1].id : null,
  };
}

// {id}: una; {tipo, referencia}: todas las de un destino; nada: todas.
export async function readNotifications(user, filtro = {}) {
  const { count } = await prisma.notificacion.updateMany({
    where: { idUsuario: user, leida: false, ...filtro },
    data: { leida: true },
  });
  if (count) emitToUser(user, 'notifications:changed', {});
  return count;
}
