import { requireRole } from './communitiesService.js';
import { withCommunityChannelsLock } from '../utils/communityChannelsLock.js';
import { channelSelect, effectiveChannelPermissions, memberRoleIds, memberSelect } from '../utils/channelPermissions.js';

export async function communityActivity(id, user) {
  return withCommunityChannelsLock(id, async (tx) => {
    await requireRole(id, user, 'INTEGRANTE', tx);
    // Canales y membresía en dos consultas; los permisos se calculan en memoria.
    const [channels, member] = await Promise.all([
      tx.canal.findMany({ where: { idComunidad: id }, select: channelSelect }),
      tx.membresia.findUnique({ where: { idComunidad_idUsuario: { idComunidad: id, idUsuario: user } }, select: memberSelect }),
    ]);
    const visible = channels.filter((c) => effectiveChannelPermissions(c, member?.rol, user, memberRoleIds(member)).includes('VER'));
    const ids = visible.map((c) => c.id);
    const [connected, last] = await Promise.all([
      tx.participanteLlamada.findMany({
        where: { idCanal: { in: ids }, conectado: true },
        orderBy: { fechaConexion: 'asc' },
        select: { idCanal: true, idUsuario: true, usuario: { select: { nombreVisible: true } } },
      }),
      tx.mensaje.findFirst({
        where: { idCanal: { in: ids }, fechaEliminacion: null },
        orderBy: [{ fechaCreacion: 'desc' }, { id: 'desc' }], select: { contenido: true, fechaCreacion: true, idCanal: true },
      }),
    ]);
    // La llamada con más gente, para invitar a sumarse.
    const byChannel = new Map();
    for (const p of connected) byChannel.set(p.idCanal, [...(byChannel.get(p.idCanal) ?? []), p]);
    const [busiest] = [...byChannel.entries()].sort((a, b) => b[1].length - a[1].length);
    const llamada = busiest ? {
      idCanal: busiest[0],
      canal: visible.find((c) => c.id === busiest[0])?.nombre,
      personas: busiest[1].slice(0, 3).map((p) => p.usuario.nombreVisible),
      total: busiest[1].length,
      estoy: busiest[1].some((p) => p.idUsuario === user),
    } : null;
    return {
      participantes: connected.length,
      llamada,
      ultimoMensaje: last ? { ...last, contenido: last.contenido.slice(0, 100), canal: visible.find((c) => c.id === last.idCanal)?.nombre } : null,
    };
  });
}
