import {prisma} from '../prisma/client.js';
import {trackEffect} from '../utils/backgroundEffects.js';
// Audita cambios confirmados; nunca conserva cuerpos, mensajes ni credenciales.
export const auditCommunity=kind=>async(req,res,next)=>{
 if(/\/(calls?|messages|suggestion)(\/|$)/.test(req.path))return next();
 // Las medidas de moderación (F-14) registran su propio detalle: actor, destinatario y medida.
 if(/\/(members\/\d+\/(silence|kick)|bans(\/\d+)?|moderation\/proposals(\/.*)?)$/.test(req.path))return next();
 const match=/^\/(\d+)(?:\/|$)/.exec(req.path);if(!match||!['POST','PUT','PATCH','DELETE'].includes(req.method))return next();
 const target=Number(match[1]);if(!Number.isSafeInteger(target)||target<1||target>2147483647)return next();
 const community=kind==='canal'?(await prisma.canal.findUnique({where:{id:target},select:{idComunidad:true}}))?.idComunidad:target;
 res.on('finish',()=>{if(community&&res.statusCode<400&&req.user?.id)trackEffect(prisma.auditoria.create({data:{idComunidad:community,idActor:req.user.id,accion:describeChange(kind,req.method,req.path)}}));});next();
};

function describeChange(kind,method,path){
 const section=path.split('/').filter(Boolean).slice(1).join('/');
 const labels=[[/roles/,'roles y permisos'],[/ban|restriction|moderation/,'moderación'],[/invitation/,'invitaciones'],[/member/,'integrantes'],[/request/,'solicitudes de acceso'],[/permission|access/,'permisos'],[/channel/,'canales']];
 const subject=labels.find(([pattern])=>pattern.test(section))?.[1]??(kind==='canal'?'canal':'comunidad');
 return `${method==='DELETE'?'Se eliminó o revocó':method==='POST'?'Se agregó o modificó':'Se actualizó'}: ${subject}`;
}
