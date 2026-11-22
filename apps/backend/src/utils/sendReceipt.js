import {createHash} from 'node:crypto';
import {AppError} from './AppError.js';
export const sendFingerprint=(...parts)=>{const hash=createHash('sha256');for(const part of parts){const bytes=Buffer.isBuffer(part)?part:Buffer.from(JSON.stringify(part));hash.update(String(bytes.length)+':');hash.update(bytes);}return hash.digest('hex');};
// El lock y el recibo viven en la misma transacción que los mensajes. No guarda DTO privados.
export async function withSendReceipt(db,actor,key,fingerprint,select,create){
 if(!key)return create();
 await db.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`${actor}:${key}`},0))`;
 const previous=await db.envioConfirmado.findUnique({where:{idAutor_clave:{idAutor:actor,clave:key}}});
 if(previous){
  if(previous.huella!==fingerprint)throw new AppError(409,'SEND_KEY_CONFLICT','Este envío ya se usó con otro contenido');
  const rows=await db.mensaje.findMany({where:{id:{in:previous.mensajes},idAutor:actor},select});
  if(rows.length!==previous.mensajes.length)throw new AppError(409,'SEND_UNAVAILABLE','El envío anterior ya no está disponible');
  const byId=new Map(rows.map(row=>[row.id,row]));return Object.assign(previous.mensajes.map(id=>byId.get(id)),{replayed:true});
 }
 const rows=await create();
 await db.envioConfirmado.create({data:{idAutor:actor,clave:key,huella:fingerprint,mensajes:rows.map(row=>row.id)}});return rows;
}
