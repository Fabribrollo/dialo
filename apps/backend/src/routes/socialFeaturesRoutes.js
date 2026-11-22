import {lockRelationship} from '../utils/relationshipLock.js';
import {usuarioPublicoSelect,toUsuarioPublico} from '../utils/selects.js';
import {finishPrivateCall,lockCallUsers} from '../services/privateCallsService.js';
import {Router} from 'express';
import {z} from 'zod';
import {authenticate} from '../middlewares/authenticate.js';
import {validate} from '../middlewares/validate.js';
import {prisma} from '../prisma/client.js';
import {AppError} from '../utils/AppError.js';
import {emitToUser} from '../sockets/emitter.js';
import {adminCommunity,votePoll,closePoll,listThread,markReceipt} from '../services/socialFeaturesService.js';
const router=Router();router.use(authenticate);
const id=z.coerce.number().int().positive().max(2147483647),params=z.object({id}),page=z.object({cursor:id.optional()});
router.get('/blocked',async(req,res)=>{const rows=await prisma.bloqueoUsuario.findMany({where:{idActor:req.user.id},orderBy:{fecha:'desc'},select:{fecha:true,objetivo:{select:usuarioPublicoSelect}}});res.json({items:rows.map(r=>({fecha:r.fecha,usuario:toUsuarioPublico(r.objetivo)}))});});
router.get('/people/:id',validate({params}),async(req,res)=>{const target=req.validated.params.id,actor=req.user.id;if(!await prisma.usuario.findUnique({where:{id:target},select:{id:true}}))throw new AppError(404,'USER_NOT_FOUND','El usuario no existe');const own=await prisma.membresia.findMany({where:{idUsuario:actor},select:{idComunidad:true}});const shared=await prisma.membresia.findMany({where:{idUsuario:target,idComunidad:{in:own.map(m=>m.idComunidad)}},select:{comunidad:{select:{id:true,nombre:true}}}});res.json({bloqueado:Boolean(await prisma.bloqueoUsuario.findUnique({where:{idActor_idObjetivo:{idActor:actor,idObjetivo:target}}})),comunidades:shared.map(m=>m.comunidad)});});
router.put('/people/:id/block',validate({params,body:z.strictObject({bloqueado:z.boolean()})}),async(req,res)=>{const idObjetivo=req.validated.params.id,idActor=req.user.id;if(idObjetivo===idActor)throw new AppError(400,'SELF_BLOCK','No podés bloquearte');if(!await prisma.usuario.findUnique({where:{id:idObjetivo},select:{id:true}}))throw new AppError(404,'USER_NOT_FOUND','El usuario no existe');await prisma.$transaction(async db=>{
 await lockRelationship(db,idActor,idObjetivo);
 await lockCallUsers(db,[idActor,idObjetivo]);
 if(req.validated.body.bloqueado){
  await db.bloqueoUsuario.upsert({where:{idActor_idObjetivo:{idActor,idObjetivo}},create:{idActor,idObjetivo},update:{}});
  await db.amistad.deleteMany({where:{idUsuarioA:Math.min(idActor,idObjetivo),idUsuarioB:Math.max(idActor,idObjetivo)}});
  await db.solicitudAmistad.updateMany({where:{estado:'PENDIENTE',OR:[{idEmisor:idActor,idReceptor:idObjetivo},{idEmisor:idObjetivo,idReceptor:idActor}]},data:{estado:'RECHAZADA',fechaRespuesta:new Date()}});
 }else await db.bloqueoUsuario.deleteMany({where:{idActor,idObjetivo}});
 });if(req.validated.body.bloqueado){const calls=await prisma.llamadaPrivada.findMany({where:{estado:{in:['LLAMANDO','ACEPTADA']},OR:[{idEmisor:idActor,idReceptor:idObjetivo},{idEmisor:idObjetivo,idReceptor:idActor}]},select:{id:true}});for(const call of calls)await finishPrivateCall(call.id,idActor);}
 for(const id of [idActor,idObjetivo])emitToUser(id,'friend:removed',{idUsuario:id===idActor?idObjetivo:idActor,bloqueado:req.validated.body.bloqueado});res.json({ok:true});});
router.post('/people/:id/reports',validate({params,body:z.strictObject({motivo:z.string().trim().min(5).max(1000),idComunidad:id})}),async(req,res)=>{const idObjetivo=req.validated.params.id,idAutor=req.user.id;if(idObjetivo===idAutor||!await prisma.usuario.findUnique({where:{id:idObjetivo},select:{id:true}}))throw new AppError(400,'INVALID_REPORT','Elegí otro usuario');const {idComunidad,motivo}=req.validated.body;if(idComunidad&&await prisma.membresia.count({where:{idComunidad,idUsuario:{in:[idAutor,idObjetivo]}}})!==2)throw new AppError(403,'NO_PERMISSION','El reporte debe corresponder a una comunidad compartida');const row=await prisma.reporteUsuario.create({data:{idAutor,idObjetivo,idComunidad,motivo}});res.status(201).json({reporte:{id:row.id,estado:row.estado}});});
router.get('/communities/:id/audit',validate({params,query:page}),async(req,res)=>{const idComunidad=req.validated.params.id;await adminCommunity(req.user.id,idComunidad);const items=await prisma.auditoria.findMany({where:{idComunidad,...(req.validated.query.cursor?{id:{lt:req.validated.query.cursor}}:{})},orderBy:{id:'desc'},take:50});const actors=await prisma.usuario.findMany({where:{id:{in:[...new Set(items.map(x=>x.idActor))]}},select:{id:true,nombreVisible:true}});res.json({items:items.map(x=>({...x,actor:actors.find(a=>a.id===x.idActor)?.nombreVisible??'Usuario eliminado'}))});});
router.get('/communities/:id/reports',validate({params}),async(req,res)=>{await adminCommunity(req.user.id,req.validated.params.id);const items=await prisma.reporteUsuario.findMany({where:{idComunidad:req.validated.params.id},orderBy:{id:'desc'},take:50});const targets=await prisma.usuario.findMany({where:{id:{in:[...new Set(items.map(x=>x.idObjetivo))]}},select:{id:true,nombreVisible:true}});res.json({items:items.map(x=>({...x,objetivo:targets.find(t=>t.id===x.idObjetivo)?.nombreVisible??'Usuario eliminado'}))});});
router.patch('/reports/:id',validate({params,body:z.strictObject({estado:z.enum(['RESUELTO','DESESTIMADO'])})}),async(req,res)=>{const r=await prisma.reporteUsuario.findUnique({where:{id:req.validated.params.id}});if(!r?.idComunidad)throw new AppError(404,'REPORT_NOT_FOUND','El reporte no está disponible');await adminCommunity(req.user.id,r.idComunidad);await prisma.reporteUsuario.update({where:{id:r.id},data:req.validated.body});await prisma.auditoria.create({data:{idComunidad:r.idComunidad,idActor:req.user.id,accion:`Reporte ${r.id}: ${req.validated.body.estado}`}});res.json({ok:true});});
router.post('/polls/:id/vote',validate({params,body:z.strictObject({opciones:z.array(z.number().int().min(0).max(9)).max(10)})}),async(req,res)=>res.json(await votePoll(req.user.id,req.validated.params.id,req.validated.body.opciones)));
router.post('/polls/:id/close',validate({params,body:z.strictObject({})}),async(req,res)=>res.json(await closePoll(req.user.id,req.validated.params.id)));
router.get('/threads/:id',validate({params}),async()=>{throw new AppError(410,'THREADS_DISABLED','Los hilos están temporalmente deshabilitados');});
router.post('/receipts/:id',validate({params,body:z.strictObject({estado:z.enum(['entregado','leido'])})}),async(req,res)=>res.json(await markReceipt(req.user.id,req.validated.params.id,req.validated.body.estado)));
export default router;
