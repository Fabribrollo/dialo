import { CHANNEL_ACTIONS, expandPermissions } from './permissionCatalog.js';
export const CHANNEL_PERMISSIONS = {
  TEXTO: ['VER', 'ESCRIBIR', ...CHANNEL_ACTIONS.filter(p=>p!=='SILENCIAR'), 'BANEAR'],
  VOZ: ['VER', 'HABLAR', 'CAMARA', 'PANTALLA', 'TRANSMITIR', ...CHANNEL_ACTIONS.filter(p=>p!=='ELIMINAR_MENSAJES'), 'BANEAR'],
  VIDEO: ['VER', 'HABLAR', 'CAMARA', 'PANTALLA', 'TRANSMITIR', ...CHANNEL_ACTIONS.filter(p=>p!=='ELIMINAR_MENSAJES'), 'BANEAR'],
};

// Los roles se definen en la comunidad y se heredan íntegros, filtrados por tipo.
// VER depende de membresía/admisión/expulsión, no es un permiso editable.
export function effectiveChannelPermissions(canal,rol,idUsuario,roles=[]){
 if(!rol)return [];
 const allowed=CHANNEL_PERMISSIONS[canal.tipo]??[];
 if(['ADMIN','PROPIETARIO'].includes(rol))return [...allowed];
 const individual=(canal.habilitacionesUsuario??[]).find(g=>g.idUsuario===idUsuario);
 if((canal.expulsiones??[]).some(e=>e.idUsuario===idUsuario))return [];
 if(canal.privado&&!individual?.permisos.includes('VER'))return [];
 const values=[...(canal.privado?[]:expandPermissions(canal.permisosGlobales??(canal.tipo==='TEXTO'?['ESCRIBIR']:['HABLAR']))),...expandPermissions(individual?.permisos),...roles.filter(r=>typeof r!=='number').flatMap(r=>expandPermissions(r.permisos))];
 const result=new Set(['VER',...values.filter(p=>allowed.includes(p)&&p!=='BANEAR')]);
 if((canal.silencios??[]).some(m=>m.idUsuario===idUsuario))result.delete('HABLAR');
 for(const p of mutedPermissions(canal.comunidad?.silencios,idUsuario))result.delete(p);
 if(result.has('CAMARA')&&result.has('PANTALLA'))result.add('TRANSMITIR');
 return allowed.filter(p=>result.has(p));
}
// Silencio de comunidad (F-14): TEXTO quita escribir; VOZ quita micrófono, cámara y pantalla.
const MUTED = { TEXTO: ['ESCRIBIR'], VOZ: ['HABLAR', 'CAMARA', 'PANTALLA', 'TRANSMITIR'] };
export const activeSilence = (silencio, now = Date.now()) => !!silencio && (!silencio.fechaVencimiento || new Date(silencio.fechaVencimiento).getTime() > now);
export function mutedPermissions(silencios, idUsuario, now = Date.now()) {
 const silencio = (silencios ?? []).find(s => s.idUsuario === idUsuario);
 if (!activeSilence(silencio, now)) return [];
 return silencio.alcance === 'AMBOS' ? [...MUTED.TEXTO, ...MUTED.VOZ] : MUTED[silencio.alcance] ?? [];
}
export const canModerateChannel = (rol, permisos) => permisos.includes('VER') &&
  (['PROPIETARIO','ADMIN'].includes(rol) || permisos.includes('ELIMINAR_MENSAJES'));

export const channelSelect = {
  expulsiones:{select:{idUsuario:true}},
  silencios:{select:{idUsuario:true}},
  permisosGlobales: true,
  id: true, idComunidad: true, nombre: true, tipo: true, privado: true, posicion: true, fechaCreacion: true,
  comunidad: { select: { moderacionActiva: true, silencios: { select: { idUsuario: true, alcance: true, fechaVencimiento: true } } } },
  habilitacionesRol: { select: { rol: true, permisos: true } },
  habilitacionesUsuario: { select: { idUsuario: true, permisos: true } },
  habilitacionesRolPersonalizado: { select: { idRol: true, permisos: true } },
};

export const memberSelect = { idUsuario: true, rol: true, rolesPersonalizados: { select: { idRol: true, rol: {select:{id:true,permisos:true}} } } };
export const memberRoleIds = (miembro) => miembro?.rolesPersonalizados?.map((r) => r.rol ?? {id:r.idRol,permisos:[]}) ?? [];

export function toChannel(canal, misPermisos) {
  return {
    id: canal.id, idComunidad: canal.idComunidad, nombre: canal.nombre, tipo: canal.tipo,
    moderacionActiva: Boolean(canal.comunidad?.moderacionActiva),
    bloqueado: !misPermisos.includes('VER'),
    privado: canal.privado, posicion: canal.posicion, misPermisos, fechaCreacion: canal.fechaCreacion,
  };
}
