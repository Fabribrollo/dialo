import {unarchivedRecipients,chatMessageActivity} from './chatStateService.js';
import { randomUUID } from 'node:crypto';
import { prisma } from '../prisma/client.js';
import { channelSelect, effectiveChannelPermissions, memberRoleIds, memberSelect } from '../utils/channelPermissions.js';
import { emitToUser } from '../sockets/emitter.js';

const PAGE = 30;
// Lecturas en una sola instantánea; el margen cubre bases remotas con latencia alta (el default de Prisma es 5 s).
const SNAPSHOT = { isolationLevel: 'RepeatableRead', maxWait: 10000, timeout: 20000 };
export const SECURITY_TYPES = ['roles', 'acceso', 'baneo', 'rehabilitado', 'solicitud_canal', 'acceso_aceptado', 'acceso_rechazado'];

// Se guarda en la misma transacción que el cambio; ningún nombre privado persiste.
export async function securityNotice(tx, users, tipo, referencia) {
  if (!SECURITY_TYPES.includes(tipo)) throw new TypeError('Tipo de aviso inválido');
  const recipients = await tx.usuario.findMany({
    where: { id: { in: [...new Set(users)] } }, select: { id: true, preferencias: true },
  });
  const unarchived=new Set(await unarchivedRecipients(tx,recipients.map(u=>u.id),tipo,referencia));
  const targets = recipients.filter((u) => !u.preferencias?.silenciarNotificaciones&&unarchived.has(u.id));
  if (!targets.length) return [];
  const origen = `seguridad:${randomUUID()}`;
  return tx.notificacion.createManyAndReturn({
    data: targets.map((u) => ({ idUsuario: u.id, tipo, referencia, origen })),
    select: { idUsuario: true },
  });
}

export function publishNotices(notices = []) {
  for (const id of new Set(notices.map((n) => n.idUsuario))) emitToUser(id, 'notifications:changed', {});
}

export async function accessNotices(tx, canal, before, after) {
  const recipients = [...after].filter(([id, permissions]) => {
    const previous = before.get(id);
    return previous && previous.some((p) => !permissions.includes(p));
  }).map(([id]) => id);
  return recipients.length ? securityNotice(tx, recipients, 'acceso', canal.id) : [];
}

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
export async function notifyMany(users, tipo, referencia, origen, distincion) {
  const pending = [...new Set(users)].filter((user) => !isWatching(user, tipo, referencia));
  if (!pending.length) return;
  const owners = await prisma.usuario.findMany({ where: { id: { in: pending } }, select: { id: true, preferencias: true } });
  const targets = await unarchivedRecipients(prisma,owners.filter((o) => !o.preferencias?.silenciarNotificaciones).map((o) => o.id),tipo,referencia);
  if (!targets.length) return;
  const created = await prisma.notificacion.createManyAndReturn({
    data: targets.map((idUsuario) => ({ idUsuario, tipo, referencia, origen,...(distincion?{distincion}:{}) })),
    skipDuplicates: true,
    select: { idUsuario: true },
  });
  for (const { idUsuario } of created) emitToUser(idUsuario, 'notifications:changed', {});
}

export const notify = async(user,tipo,referencia,origen)=>{
 let distincion;
 if(tipo==='conversacion'){
  await chatMessageActivity(tipo,referencia);
  const messageId=Number(/^mensaje:(\d+)$/.exec(origen??'')?.[1]);
  if(messageId){const m=await prisma.mensaje.findUnique({where:{id:messageId},select:{contenido:true,respuesta:{select:{idAutor:true}}}});const target=await prisma.usuario.findUnique({where:{id:user},select:{nombreUsuario:true}});const mentions=[...(m?.contenido??'').matchAll(/(?:^|\s)@([\p{L}\p{N}_.]+)/gu)].map(x=>x[1].toLowerCase());if(target&&mentions.includes(target.nombreUsuario.toLowerCase()))distincion='mencion';else if(m?.respuesta?.idAutor===user)distincion='respuesta';}
 }
 return notifyMany([user],tipo,referencia,origen,distincion);
};

export async function notifyChannelMessage(idCanal, actor, messageId) {
  await chatMessageActivity('canal',idCanal,actor);
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
  }, SNAPSHOT);
  const message=await prisma.mensaje.findUnique({where:{id:messageId},select:{contenido:true,respuesta:{select:{idAutor:true}},autor:{select:{id:true}}}});
  const tokens=[...(message?.contenido??'').matchAll(/(?:^|\s)@([\p{L}\p{N}_.]+)/gu)].map(m=>m[1].toLowerCase());
  const mentioned=tokens.length?await prisma.usuario.findMany({where:{id:{in:recipients},...(tokens.includes('everyone')?{}:{nombreUsuario:{in:tokens,mode:'insensitive'}})},select:{id:true}}):[];
  const mentionIds=new Set(mentioned.map(m=>m.id));const reply=message?.respuesta?.idAutor;
  await notifyMany(recipients.filter(id=>!mentionIds.has(id)&&id!==reply),'canal',idCanal,`mensaje:${messageId}`);
  await notifyMany([...mentionIds],'canal',idCanal,`mensaje:${messageId}`,'mencion');
  if(reply&&recipients.includes(reply)&&!mentionIds.has(reply))await notifyMany([reply],'canal',idCanal,`mensaje:${messageId}`,'respuesta');
}

// Resuelve en lote qué destinos sigue viendo el usuario y con qué nombre mostrarlos.
async function visibleDestinations(user, db) {
  const refs = await db.notificacion.findMany({
    where: { idUsuario: user }, distinct: ['tipo', 'referencia'], select: { tipo: true, referencia: true },
  });
  const ids = { canal: [], conversacion: [], amistad: [], acceso: [], acceso_aceptado: [], solicitud_canal: [], roles: [] };
  for (const r of refs) ids[r.tipo]?.push(r.referencia);

  const [canales, conversaciones, solicitudes] = await Promise.all([
    (ids.canal.length || ids.acceso.length || ids.acceso_aceptado.length) ? db.canal.findMany({
      where: { id: { in: [...ids.canal, ...ids.acceso, ...ids.acceso_aceptado] } },
      select: { ...channelSelect, comunidad: { select: { nombre: true, moderacionActiva: true } } },
    }) : [],
    ids.conversacion.length ? db.conversacionPrivada.findMany({
      where: { id: { in: ids.conversacion }, OR: [{ idUsuarioA: user }, { idUsuarioB: user }] },
      select: {
        id: true, idUsuarioA: true,
        usuarioA: { select: { nombreVisible: true, fotoUrl: true } },
        usuarioB: { select: { nombreVisible: true, fotoUrl: true } },
      },
    }) : [],
    ids.amistad.length ? db.solicitudAmistad.findMany({
      where: { id: { in: ids.amistad }, idReceptor: user, estado: 'PENDIENTE' },
      select: { id: true, emisor: { select: { nombreVisible: true, fotoUrl: true } } },
    }) : [],
  ]);

  const memberships = canales.length ? await db.membresia.findMany({
    where: { idUsuario: user, idComunidad: { in: [...new Set(canales.map((c) => c.idComunidad))] } },
    select: { idComunidad: true, ...memberSelect },
  }) : [];
  const byCommunity = new Map(memberships.map((m) => [m.idComunidad, m]));

  const context = new Map();
  // Los avisos de seguridad sobreviven a la pérdida de acceso, pero sin contexto privado.
  for (const r of refs) if (SECURITY_TYPES.includes(r.tipo) && r.tipo !== 'solicitud_canal') context.set(`${r.tipo}:${r.referencia}`, {});
  if (ids.solicitud_canal.length) {
    const requests = await db.solicitudAccesoCanal.findMany({where:{id:{in:ids.solicitud_canal},estado:'PENDIENTE',canal:{privado:true},membresia:{comunidad:{membresias:{some:{idUsuario:user,rol:{in:['ADMIN','PROPIETARIO']}}}}}},select:{id:true,idCanal:true,idComunidad:true,canal:{select:{nombre:true}}}});
    for (const q of requests) context.set(`solicitud_canal:${q.id}`,{nombre:q.canal.nombre,idCanal:q.idCanal,idComunidad:q.idComunidad});
  }
  if (ids.roles.length) {
    const communities = await db.membresia.findMany({
      where: { idUsuario: user, idComunidad: { in: ids.roles } },
      select: { idComunidad: true, comunidad: { select: { nombre: true } } },
    });
    for (const m of communities) context.set(`roles:${m.idComunidad}`, { nombre: m.comunidad.nombre, idComunidad: m.idComunidad });
  }
  for (const c of canales) {
    const m = byCommunity.get(c.idComunidad);
    if (!effectiveChannelPermissions(c, m?.rol, user, memberRoleIds(m)).includes('VER')) continue;
    const value = { nombre: c.nombre, comunidad: c.comunidad.nombre, idComunidad: c.idComunidad };
    context.set(`canal:${c.id}`, value);
    if (ids.acceso_aceptado.includes(c.id)) context.set(`acceso_aceptado:${c.id}`, value);
    if (ids.acceso.includes(c.id)) context.set(`acceso:${c.id}`, value);
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
async function messagePreviews(items, db) {
  const ids = items.map((n) => /^mensaje:(\d+)$/.exec(n.origen)?.[1]).filter(Boolean).map(Number);
  if (!ids.length) return new Map();
  const rows = await db.mensaje.findMany({
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
  return prisma.$transaction(async (db) => {
    const { where, context } = await visibleDestinations(user, db);
    const [items, unread] = await Promise.all([
      db.notificacion.findMany({
        where: { ...where, ...(cursor ? { id: { lt: cursor } } : {}) },
        orderBy: { id: 'desc' }, take: PAGE + 1,
        select: { distincion:true,id: true, tipo: true, referencia: true, origen: true, leida: true, fechaCreacion: true },
      }),
      db.notificacion.count({ where: { ...where, leida: false } }),
    ]);
    const page = items.slice(0, PAGE);
    const previews = await messagePreviews(page, db);
    return {
      items: page.map(({ origen, distincion,...n }) => ({ ...n,...(distincion?{distincion}:{}), contexto: context.get(`${n.tipo}:${n.referencia}`), vista: previews.get(origen) })),
      noLeidas: unread,
      nextCursor: items.length > PAGE ? items[PAGE - 1].id : null,
    };
  }, SNAPSHOT);
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
