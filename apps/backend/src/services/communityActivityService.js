import { prisma } from '../prisma/client.js';
import { getChannelPermissions } from './channelsService.js';
import { requireRole } from './communitiesService.js';
import { withCommunityChannelsLock } from '../utils/communityChannelsLock.js';

export async function communityActivity(id, user) {
  return withCommunityChannelsLock(id, async (tx) => {
    await requireRole(id, user, 'INTEGRANTE', tx);
    const channels = await tx.canal.findMany({ where: { idComunidad: id }, select: { id: true, nombre: true } });
    const visible = [];
    for (const c of channels) if ((await getChannelPermissions(c.id, user, tx)).includes('VER')) visible.push(c);
    const participants = await tx.participanteLlamada.count({ where: { idCanal: { in: visible.map((c) => c.id) }, conectado: true } });
    const last = await tx.mensaje.findFirst({
      where: { idCanal: { in: visible.map((c) => c.id) }, fechaEliminacion: null },
      orderBy: [{ fechaCreacion:'desc' },{id:'desc'}], select: { contenido:true, fechaCreacion:true, idCanal:true },
    });
    return { participantes:participants, ultimoMensaje: last ? { ...last, contenido: last.contenido.slice(0,100), canal:visible.find((c)=>c.id===last.idCanal)?.nombre } : null };
  });
}
