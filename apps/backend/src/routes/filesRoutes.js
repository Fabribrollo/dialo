import {requireReply} from '../services/messageInteractionsService.js';
import {randomUUID} from 'node:crypto';
import {withSendReceipt,sendFingerprint} from '../utils/sendReceipt.js';
import { moderateChannelMessage } from '../services/communityModerationService.js';
import { trackEffect } from '../utils/backgroundEffects.js';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../prisma/client.js';
import { authenticate } from '../middlewares/authenticate.js';
import { AppError } from '../utils/AppError.js';
import { requireConversationParticipant } from '../services/conversationsService.js';
import { areFriends } from '../services/friendsService.js';
import { withChannelPermission } from '../services/channelsService.js';
import { channelMessageSelect, toChannelMessage } from '../utils/channelMessages.js';
import { mensajeSelect, toMensaje } from '../utils/messages.js';
import { emitToChannel, emitToConversation } from '../sockets/emitter.js';
import { limitImageUploads } from '../utils/rateLimit.js';
import { notify, notifyChannelMessage } from '../services/notificationsService.js';

const router = Router();
router.use(authenticate);
const destination = z.strictObject({ tipo:z.enum(['canal','conversacion']), id:z.coerce.number().int().positive().max(2147483647) });
const upload = multer({storage:multer.memoryStorage(), limits:{fileSize:5*1024*1024,files:1,fields:5}});
async function authorize(db, tipo, id, actor, write=false) {
  if(tipo==='canal') {
    const { requireChannelPermission } = await import('../services/channelsService.js');
    return requireChannelPermission(id,actor,write?'ESCRIBIR':'VER',db);
  }
  const c=await requireConversationParticipant(id,actor,db);
  const other=c.idUsuarioA===actor?c.idUsuarioB:c.idUsuarioA;
  if(write&&!await areFriends(actor,other,db))throw new AppError(403,'NOT_FRIENDS','Ya no son amigos');
  return c;
}
function checkedFile(f) {
  const buffer=f.buffer;
  const audio=['audio/webm','audio/ogg','audio/mp4'].includes(f.mimetype?.split(';')[0]);
  const mime=audio&&(buffer.subarray(0,4).equals(Buffer.from([26,69,223,163]))||buffer.subarray(0,4).toString()==='OggS'||buffer.subarray(4,8).toString()==='ftyp')?f.mimetype.split(';')[0]:buffer.subarray(0,5).toString()==='%PDF-'?'application/pdf'
    :buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png'
    :buffer[0]===255&&buffer[1]===216&&buffer[2]===255?'image/jpeg'
    :buffer.subarray(4,8).toString()==='ftyp'&&buffer.length>=16?'video/mp4'
    :buffer.subarray(0,4).equals(Buffer.from([26,69,223,163]))?'video/webm'
    :buffer.subarray(0,4).toString()==='RIFF'&&buffer.subarray(8,12).toString()==='WEBP'?'image/webp':null;
  if(!mime)throw new AppError(400,'INVALID_FILE','Se admiten imágenes/PDF de hasta 5 MB y videos MP4/WebM de hasta 2 MB');
  if(mime.startsWith('video/')&&buffer.length>2*1024*1024)throw new AppError(400,'VIDEO_TOO_LARGE','El video no puede superar 2 MB');
  return {nombre:f.originalname.replace(/[\\/\r\n\x00-\x1f]/g,'_').slice(-120)||'archivo',tipo:mime,datos:buffer};
}
async function publishFiles(req,res,files,batch=false) {
  const parsed=destination.safeParse({tipo:req.body.tipo,id:req.body.id});
  const caption=z.string().trim().max(2000).safeParse(req.body.texto??'');
  const reply=z.coerce.number().int().positive().max(2147483647).optional().safeParse(req.body.idRespuesta);
  if(!reply.success)throw new AppError(400,'INVALID_REPLY','Respuesta inválida');
  const key=z.string().uuid().optional().safeParse(req.body.idEnvio);
  if(!key.success||!parsed.success||!caption.success||!files?.length)throw new AppError(400,'INVALID_FILE','Indicá destino, archivos y texto de hasta 2000 caracteres');
  if(files.reduce((n,f)=>n+f.size,0)>20*1024*1024)throw new AppError(400,'INVALID_FILE','El envío completo no puede superar 20 MB');
  const {tipo,id}=parsed.data,checked=files.map(checkedFile);
  // Verificar autorización antes de moderar; el commit vuelve a comprobar permisos.
  await authorize(prisma,tipo,id,req.user.id,true);
  if(tipo==='canal'&&caption.data)await moderateChannelMessage(id,caption.data,req.user.id);
  const save=async(db)=>{
    const channel=await authorize(db,tipo,id,req.user.id,true);
    if(tipo==='canal'&&/(?:^|\s)@everyone\b/i.test(caption.data)&&!channel.permisos.includes('GESTIONAR_CANALES'))throw new AppError(403,'NO_MENTION_PERMISSION','No tenés permiso para mencionar a todos');
    if(tipo==='canal'&&channel.canal?.tipo!=='TEXTO')throw new AppError(400,'CHANNEL_NOT_TEXT','Los archivos se envían a canales de texto');
    return withSendReceipt(db,req.user.id,key.data,sendFingerprint(tipo,id,caption.data,...(reply.data?[reply.data]:[]),...checked.flatMap(f=>[f.nombre,f.tipo,f.datos])),tipo==='canal'?channelMessageSelect:mensajeSelect,async()=>{
    await requireReply(db,reply.data,tipo,id);
    const rows=[],group=checked.length>=4?{idGrupoAdjuntos:key.data??randomUUID(),cantidadGrupoAdjuntos:checked.length}:{};
    for(const [i,file] of checked.entries())rows.push(await db.mensaje.create({
      data:{...group,...(i===0&&reply.data?{idRespuesta:reply.data}:{}),idAutor:req.user.id,[tipo==='canal'?'idCanal':'idConversacion']:id,contenido:i===0&&caption.data?caption.data:'Archivo adjunto',adjunto:{create:file}},
      select:tipo==='canal'?channelMessageSelect:mensajeSelect,
    }));
    return rows;
    });
  };
  const rows=tipo==='canal'?await withChannelPermission(id,req.user.id,'ESCRIBIR',save):await prisma.$transaction(save);
  const messages=rows.map(tipo==='canal'?toChannelMessage:toMensaje);
  if(!rows.replayed){for(const mensaje of messages){
    if(tipo==='canal')await emitToChannel(id,'channel-message:new',{mensaje});
    else emitToConversation(id,'message:new',{mensaje});
  }
  if(tipo==='canal')trackEffect(notifyChannelMessage(id,req.user.id,rows[0].id,caption.data));
  else {const c=await requireConversationParticipant(id,req.user.id);trackEffect(notify(c.idUsuarioA===req.user.id?c.idUsuarioB:c.idUsuarioA,'conversacion',id,`mensaje:${rows[0].id}`));}
  }
  res.status(201).json(batch?{mensajes:messages}:{mensaje:messages[0]});
}
router.post('/',limitImageUploads,(req,res,next)=>upload.single('archivo')(req,res,err=>{
  if(err)return next(new AppError(400,'INVALID_FILE','Elegí un único archivo de hasta 5 MB'));next();
}),async(req,res)=>publishFiles(req,res,req.file?[req.file]:[]));
const batchUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:6,fields:5}});
router.post('/batch',limitImageUploads,(req,res,next)=>batchUpload.array('archivo',6)(req,res,err=>{
  if(err)return next(new AppError(400,'INVALID_FILE','Elegí hasta 6 archivos, de hasta 5 MB cada uno'));next();
}),async(req,res)=>publishFiles(req,res,req.files,true));
router.get('/shared/:tipo/:id',async(req,res)=>{
  const parsed=destination.safeParse(req.params);
  if(!parsed.success)throw new AppError(400,'VALIDATION_ERROR','Destino inválido');
  const {tipo,id}=parsed.data;
  const list = async(db) => {
    await authorize(db,tipo,id,req.user.id);
    return db.mensaje.findMany({
      where:{[tipo==='canal'?'idCanal':'idConversacion']:id,fechaEliminacion:null,adjunto:{isNot:null}},
      select:{id:true,fechaCreacion:true,adjunto:{select:{id:true,nombre:true,tipo:true}}},
      orderBy:{id:'desc'},take:30,
    });
  };
  const items = tipo === 'canal' ? await withChannelPermission(id,req.user.id,'VER',list) : await list(prisma);
  res.json({items});
});
router.get('/:id',async(req,res)=>{
  const id=z.coerce.number().int().positive().safeParse(req.params.id);
  if(!id.success)throw new AppError(400,'VALIDATION_ERROR','Archivo inválido');
  const meta=await prisma.adjunto.findUnique({where:{id:id.data},select:{idMensaje:true}});
  if(!meta)throw new AppError(404,'FILE_NOT_FOUND','El archivo no está disponible');
  const m=await prisma.mensaje.findUnique({where:{id:meta.idMensaje}});
  if(!m||m.fechaEliminacion)throw new AppError(404,'FILE_NOT_FOUND','El archivo no está disponible');
  const send=async(db)=>{
    await authorize(db,m.idCanal?'canal':'conversacion',m.idCanal||m.idConversacion,req.user.id);
    const current = await db.mensaje.findUnique({where:{id:m.id},select:{fechaEliminacion:true}});
    if(!current || current.fechaEliminacion)throw new AppError(404,'FILE_NOT_FOUND','El archivo no está disponible');
    const f=await db.adjunto.findUnique({where:{id:id.data}});
    const bytes=Buffer.from(f.datos),inline=req.query.download!=='1';
    res.set({'Content-Type':f.tipo,'Content-Disposition':`${inline?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(f.nombre)}`,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store','Accept-Ranges':'bytes'});
    if(req.headers.range){
      const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      let start=match?.[1]?Number(match[1]):0,end=match?.[2]?Number(match[2]):bytes.length-1;
      if(match&&!match[1]&&match[2]){start=Math.max(0,bytes.length-Number(match[2]));end=bytes.length-1;}
      if(!match||(!match[1]&&!match[2])||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=bytes.length){res.set('Content-Range',`bytes */${bytes.length}`);res.status(416).end();return;}
      end=Math.min(end,bytes.length-1);res.status(206).set('Content-Range',`bytes ${start}-${end}/${bytes.length}`).set('Content-Length',String(end-start+1)).send(bytes.subarray(start,end+1));
    }else res.set('Content-Length',String(bytes.length)).send(bytes);
  };
  if(m.idCanal)await withChannelPermission(m.idCanal,req.user.id,'VER',send);
  else await send(prisma);
});
export default router;
