import {markReceipt} from './socialFeaturesService.js';
import {prisma} from '../prisma/client.js';
import {AppError} from '../utils/AppError.js';
import {channelSelect,memberSelect,memberRoleIds,effectiveChannelPermissions} from '../utils/channelPermissions.js';
import {emitToUser} from '../sockets/emitter.js';

async function scope(db,user,tipo,destino){
 if(tipo==='conversacion'){
  const c=await db.conversacionPrivada.findFirst({where:{id:destino,OR:[{idUsuarioA:user},{idUsuarioB:user}]},select:{fechaCreacion:true}});
  if(!c)throw new AppError(404,'CONVERSATION_NOT_FOUND','La conversación no existe');return c;
 }
 if(tipo==='comunidad'){
  const m=await db.membresia.findUnique({where:{idComunidad_idUsuario:{idComunidad:destino,idUsuario:user}},select:{fechaIngreso:true}});
  if(!m)throw new AppError(404,'COMMUNITY_NOT_FOUND','La comunidad no existe');return m;
 }
 const c=await db.canal.findUnique({where:{id:destino},select:channelSelect});
 const m=c&&await db.membresia.findUnique({where:{idComunidad_idUsuario:{idComunidad:c.idComunidad,idUsuario:user}},select:memberSelect});
 if(!c||!effectiveChannelPermissions(c,m?.rol,user,memberRoleIds(m)).includes('VER'))throw new AppError(404,'CHANNEL_NOT_FOUND','El canal no existe');return c;
}
export async function changeChatState(user,tipo,destino,body){
 const saved=await prisma.$transaction(async tx=>{
  await scope(tx,user,tipo,destino);
  if(tipo==='canal'&&('archivado'in body||'oculto'in body))throw new AppError(400,'INVALID_CHAT_STATE','Se archiva la comunidad completa');
  if(tipo==='comunidad'&&body.oculto)throw new AppError(400,'USE_LEAVE_COMMUNITY','Para quitar la comunidad tenés que abandonarla');
  const data={...(body.silencio?{silencioPermanente:body.silencio==='siempre',silenciadoHasta:['60','1440'].includes(body.silencio)?new Date(Date.now()+Number(body.silencio)*60000):null}:{}),...('archivado'in body?{archivado:body.archivado}:{}),...('oculto'in body?{oculto:body.oculto}:{}),...(body.leido?{leidoHasta:new Date()}: {})};
  return tx.estadoChat.upsert({where:{idUsuario_tipo_destino:{idUsuario:user,tipo,destino}},create:{idUsuario:user,tipo,destino,...data},update:data});
 });
 if(body.leido&&tipo==='conversacion')await markReceipt(user,destino,'leido');
 emitToUser(user,'chat-state:changed',{});return saved;
}
export async function chatStates(user){
 return prisma.$transaction(async tx=>{
  const [states,conversations,memberships]=await Promise.all([
   tx.estadoChat.findMany({where:{idUsuario:user}}),
   tx.conversacionPrivada.findMany({where:{OR:[{idUsuarioA:user},{idUsuarioB:user}]},select:{id:true,fechaCreacion:true}}),
   tx.membresia.findMany({where:{idUsuario:user},select:{...memberSelect,idComunidad:true,fechaIngreso:true}}),
  ]);
  const byKey=new Map(states.map(s=>[`${s.tipo}:${s.destino}`,s]));
  const channels=await tx.canal.findMany({where:{idComunidad:{in:memberships.map(m=>m.idComunidad)}},select:channelSelect});
  const visible=new Map(memberships.map(m=>[m.idComunidad,channels.filter(c=>c.idComunidad===m.idComunidad&&effectiveChannelPermissions(c,m.rol,user,memberRoleIds(m)).includes('VER'))]));
  const OR=[...conversations.map(c=>({idConversacion:c.id,fechaCreacion:{gt:byKey.get(`conversacion:${c.id}`)?.leidoHasta??c.fechaCreacion}})),...memberships.flatMap(m=>visible.get(m.idComunidad).map(c=>({idCanal:c.id,fechaCreacion:{gt:byKey.get(`canal:${c.id}`)?.leidoHasta??m.fechaIngreso}})))];
  const counts=OR.length?await tx.mensaje.groupBy({by:['idConversacion','idCanal'],where:{OR,idAutor:{not:user},fechaEliminacion:null},_count:{_all:true}}):[];
  const byConversation=new Map(counts.filter(c=>c.idConversacion).map(c=>[c.idConversacion,c._count._all]));const byChannel=new Map(counts.filter(c=>c.idCanal).map(c=>[c.idCanal,c._count._all]));
  const items=conversations.map(c=>{const state=byKey.get(`conversacion:${c.id}`);return {tipo:'conversacion',destino:c.id,archivado:state?.archivado??false,oculto:state?.oculto??false,silenciado:Boolean(state?.silencioPermanente||state?.silenciadoHasta>new Date()),noLeidos:byConversation.get(c.id)??0};});
  for(const m of memberships){const state=byKey.get(`comunidad:${m.idComunidad}`);items.push({tipo:'comunidad',destino:m.idComunidad,archivado:state?.archivado??false,oculto:false,silenciado:Boolean(state?.silencioPermanente||state?.silenciadoHasta>new Date()),noLeidos:visible.get(m.idComunidad).reduce((sum,c)=>sum+(byChannel.get(c.id)??0),0)});}
  return items;
 },{isolationLevel:'RepeatableRead',timeout:30000});
}
// No mensajes privados en el evento: todas las pestañas consultan su resumen autorizado.
export async function chatMessageActivity(tipo,id,actor,db=prisma){
 if(tipo==='conversacion'){
  const c=await db.conversacionPrivada.findUnique({where:{id},select:{idUsuarioA:true,idUsuarioB:true}});if(!c)return;
  const users=[c.idUsuarioA,c.idUsuarioB];await db.estadoChat.updateMany({where:{tipo,destino:id,idUsuario:{in:users},oculto:true},data:{oculto:false}});
  for(const user of users)emitToUser(user,'chat-state:changed',{});
 }else{
  const c=await db.canal.findUnique({where:{id},select:{idComunidad:true}});if(!c)return;
  const members=await db.membresia.findMany({where:{idComunidad:c.idComunidad},select:{idUsuario:true}});for(const m of members)emitToUser(m.idUsuario,'chat-state:changed',{});
 }
}
export async function unarchivedRecipients(db,users,tipo,referencia){
 let kind=tipo,id=referencia;
 if(['canal','acceso','acceso_aceptado'].includes(tipo)){const c=await db.canal.findUnique({where:{id:referencia},select:{idComunidad:true}});if(!c)return [];kind='comunidad';id=c.idComunidad;}
 else if(['roles','baneo','rehabilitado'].includes(tipo))kind='comunidad';
 else if(tipo==='solicitud_canal'){const q=await db.solicitudAccesoCanal.findUnique({where:{id:referencia},select:{idComunidad:true}});if(!q)return [];kind='comunidad';id=q.idComunidad;}
 if(!['conversacion','comunidad'].includes(kind))return users;
 const rows=await db.estadoChat.findMany({where:{idUsuario:{in:users},tipo:kind,destino:id,OR:[{archivado:true},{silencioPermanente:true},{silenciadoHasta:{gt:new Date()}}]},select:{idUsuario:true}});const muted=new Set(rows.map(r=>r.idUsuario));return users.filter(u=>!muted.has(u));
}
