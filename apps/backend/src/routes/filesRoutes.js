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
const upload = multer({storage:multer.memoryStorage(), limits:{fileSize:5*1024*1024,files:1,fields:2}});
async function authorize(db, tipo, id, actor, write=false) {
  if(tipo==='canal') {
    const { requireChannelPermission } = await import('../services/channelsService.js');
    return requireChannelPermission(id,actor,write?'ESCRIBIR':'VER',db);
  }
  const c=await requireConversationParticipant(id,actor);
  const other=c.idUsuarioA===actor?c.idUsuarioB:c.idUsuarioA;
  if(write&&!await areFriends(actor,other))throw new AppError(403,'NOT_FRIENDS','Ya no son amigos');
  return c;
}
router.post('/',limitImageUploads,(req,res,next)=>upload.single('archivo')(req,res,(err)=>{
  if(err)return next(new AppError(400,'INVALID_FILE','Elegí un único archivo de hasta 5 MB'));
  next();
}),async(req,res)=>{
  const parsed=destination.safeParse(req.body);
  if(!parsed.success||!req.file)throw new AppError(400,'INVALID_FILE','Indicá el destino y un archivo');
  const {tipo,id}=parsed.data, f=req.file;
  const buffer=f.buffer;
  // Los bytes, no el MIME enviado por el navegador, determinan los tipos permitidos.
  const mime=buffer.subarray(0,5).toString()==='%PDF-'?'application/pdf'
    :buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png'
    :buffer[0]===255&&buffer[1]===216&&buffer[2]===255?'image/jpeg'
    :buffer.subarray(0,4).toString()==='RIFF'&&buffer.subarray(8,12).toString()==='WEBP'?'image/webp':null;
  if(!mime)throw new AppError(400,'INVALID_FILE','Se admiten PDF, PNG, JPG y WebP de hasta 5 MB');
  const name=f.originalname.replace(/[\\/\r\n\x00-\x1f]/g,'_').slice(-120)||'archivo';
  const save=async(db)=>{
    await authorize(db,tipo,id,req.user.id,true);
    return db.mensaje.create({
      data:{idAutor:req.user.id,[tipo==='canal'?'idCanal':'idConversacion']:id,contenido:'Archivo adjunto',adjunto:{create:{nombre:name,tipo:mime,datos:buffer}}},
      select:tipo==='canal'?channelMessageSelect:mensajeSelect,
    });
  };
  const row=tipo==='canal'?await withChannelPermission(id,req.user.id,'ESCRIBIR',save):await prisma.$transaction(save);
  const mensaje=tipo==='canal'?toChannelMessage(row):toMensaje(row);
  if(tipo==='canal') {
    await emitToChannel(id,'channel-message:new',{mensaje});
    trackEffect(notifyChannelMessage(id,req.user.id,row.id,''));
  } else {
    emitToConversation(id,'message:new',{mensaje});
    const c=await requireConversationParticipant(id,req.user.id);
    trackEffect(notify(c.idUsuarioA===req.user.id?c.idUsuarioB:c.idUsuarioA,'conversacion',id,`mensaje:${row.id}`));
  }
  res.status(201).json({mensaje});
});
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
    res.set({'Content-Type':f.tipo,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(f.nombre)}`,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});
    res.send(Buffer.from(f.datos));
  };
  if(m.idCanal)await withChannelPermission(m.idCanal,req.user.id,'VER',send);
  else await send(prisma);
});
export default router;
