import assert from 'node:assert/strict';
import {after,before,beforeEach,test} from 'node:test';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {Server} from 'socket.io';
import {applyMigrations} from './migrations.js';
const url=process.env.TEST_DATABASE_URL;
if(!url)throw new Error('Configurá TEST_DATABASE_URL con una PostgreSQL exclusiva de pruebas');
const schema=`test_plans_review_${randomUUID().replaceAll('-','')}`;
const isolated=new URL(url);isolated.searchParams.set('schema',schema);
process.env.DATABASE_URL=isolated.href;process.env.DIRECT_URL=isolated.href;process.env.NODE_ENV='production';process.env.OPENAI_API_KEY='test-only';process.env.OPENAI_GENERATION_MODEL='test-model';process.env.CLOUDINARY_URL='';process.env.RESEND_API_KEY='';
const admin=new PrismaClient({datasourceUrl:url}),originalFetch=globalThis.fetch;
let prisma,io,server,base,ana,beto,cata,community,channel,provider,calls,review,send,drain;
const json=value=>({ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]})});
const target=c=>({id:c.id,nombre:c.nombre,tipo:c.tipo,privado:c.privado,permisosGlobales:c.permisosGlobales.filter(p=>p!=='VER')});
async function request(path,body,{as=ana,method=body===undefined?'GET':'POST'}={}){
 const r=await originalFetch(`${base}/api${path}`,{method,headers:{...(as?{Cookie:as.cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {status:r.status,body:r.status===204?null:await r.json()};
}
async function register(name){const r=await originalFetch(`${base}/api/auth/register`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombreUsuario:name,nombreVisible:name,correo:`${name}@example.test`,contrasena:'ClaveDePrueba123'})});assert.equal(r.status,201);return {...(await r.json()).usuario,cookie:r.headers.get('set-cookie').split(';')[0]};}
const prepare=(text='Organizá los canales para el grupo de estudio',as=ana)=>request(`/communities/${community.id}/channel-plans`,{instrucciones:text},{as});
const decide=(id,action='confirm',as=ana)=>request(`/communities/${community.id}/channel-plans/${id}/${action}`,{},{as});
const resolve=(id,decision='SIN_SANCION',extra={},as=ana)=>request(`/communities/${community.id}/review/cases/${id}/resolve`,{decision,motivo:'Revisión completada',...extra},{as});
async function flagged(author=beto){const r=await send(author.id,{idCanal:channel.id,contenido:`Mensaje para revisar ${randomUUID()}`});await drain();const row=await review(r.mensaje.id,async()=>({regla_1:1}));return row??prisma.casoRevision.create({data:{idComunidad:community.id,idCanal:channel.id,idAutor:author.id,idMensaje:r.mensaje.id,motivos:['Señal de prueba']}});}
before(async()=>{
 await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);await applyMigrations(admin,schema);
 ({prisma}=await import('../src/prisma/client.js'));({drainEffects:drain}=await import('../src/utils/backgroundEffects.js'));
 ({reviewPublishedMessage:review}=await import('../src/services/contentReviewService.js'));({sendChannelMessage:send}=await import('../src/services/channelMessagesService.js'));
 const {app}=await import('../src/app.js'),{initSockets}=await import('../src/sockets/index.js');server=createServer(app);io=new Server(server);initSockets(io);server.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${server.address().port}`;
 ana=await register('ana');beto=await register('beto');cata=await register('cata');
 globalThis.fetch=async(url,options)=>{
  if(url==='https://api.openai.com/v1/responses'){calls.push(JSON.parse(options.body));return provider(JSON.parse(options.body));}
  if(url==='https://api.openai.com/v1/decisions'){const d=JSON.parse(options.body);return {ok:true,json:async()=>({answers:d.questions.map(q=>({name:q.name,probability:0}))})};}
  return originalFetch(url,options);
 };
});
beforeEach(async()=>{
 await drain();(await import('../src/utils/rateLimit.js')).resetRateLimits();await prisma.comunidad.deleteMany();
 const r=await request('/communities',{nombre:'Club de estudio',tipo:'PRIVADA'});assert.equal(r.status,201);community=r.body.comunidad;
 await prisma.membresia.create({data:{idComunidad:community.id,idUsuario:beto.id,rol:'INTEGRANTE'}});
 channel=await prisma.canal.findFirst({where:{idComunidad:community.id}});
 calls=[];provider=body=>json({aclaracion:'',canales:JSON.parse(body.input).canales.map(target)});
});
after(async()=>{globalThis.fetch=originalFetch;await drain?.();if(io)await new Promise(r=>io.close(r));await prisma?.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect();});
test('plan: sesión y propiedad se verifican antes del proveedor',async()=>{
 assert.equal((await prepare('Renombrá el canal general',null)).status,401);
 assert.equal((await prepare('Renombrá el canal general',beto)).status,403);
 assert.equal((await prepare('Renombrá el canal general',cata)).status,404);
 assert.equal((await request(`/communities/${community.id}/channel-plans`,{instrucciones:'corto'})).status,400);assert.equal(calls.length,0);
});
test('plan: vista previa sin cambios; aplica creación, edición y orden, con auditoría e idempotencia',async()=>{
 provider=()=>json({aclaracion:'',canales:[{id:null,nombre:'estudio',tipo:'VOZ',privado:false,permisosGlobales:['HABLAR']},{...target(channel),nombre:'consultas'}]});
 const preview=await prepare();assert.equal(preview.status,200);assert.equal(await prisma.canal.count({where:{idComunidad:community.id}}),1);assert.equal((await prisma.canal.findUnique({where:{id:channel.id}})).nombre,'general');
 assert.equal(calls[0].store,false);assert.equal(JSON.parse(calls[0].input).canales[0].id,channel.id);assert.equal(calls[0].input.includes('idUsuario'),false);
 const id=preview.body.propuesta.id;const results=await Promise.all([decide(id),decide(id)]);assert.deepEqual(results.map(r=>r.status),[200,200]);
 const rows=await prisma.canal.findMany({where:{idComunidad:community.id},orderBy:{posicion:'asc'}});assert.deepEqual(rows.map(c=>c.nombre),['estudio','consultas']);assert.equal(rows[1].id,channel.id);
 assert.equal(await prisma.auditoria.count({where:{idComunidad:community.id,accion:{startsWith:'Plan IA confirmado'}}}),1);
 assert.equal((await prisma.propuestaCanales.findUnique({where:{id}})).estado,'CONFIRMADA');
});
test('plan: cancelación y vencimiento impiden ejecutar',async()=>{
 const id=(await prepare()).body.propuesta.id;assert.equal((await decide(id,'cancel')).status,200);assert.equal((await decide(id)).status,409);
 const other=(await prepare()).body.propuesta.id;await prisma.propuestaCanales.update({where:{id:other},data:{vence:new Date(0)}});assert.equal((await decide(other)).status,409);
});
test('plan: cambios concurrentes en canales, permisos y propiedad obligan a revisar',async()=>{
 let id=(await prepare()).body.propuesta.id;await prisma.canal.update({where:{id:channel.id},data:{nombre:'nuevo'}});assert.equal((await decide(id)).body.error.code,'PLAN_STALE');
 id=(await prepare()).body.propuesta.id;await prisma.canal.update({where:{id:channel.id},data:{permisosGlobales:['VER']}});assert.equal((await decide(id)).body.error.code,'PLAN_STALE');
 id=(await prepare()).body.propuesta.id;await prisma.membresia.update({where:{idComunidad_idUsuario:{idComunidad:community.id,idUsuario:ana.id}},data:{rol:'ADMIN'}});assert.equal((await decide(id)).status,403);
});
test('plan: ambigüedad, IDs ajenos, tipos cambiados y privilegios inválidos no son confirmables',async()=>{
 provider=()=>json({aclaracion:'¿Qué canal querés cambiar?',canales:[]});let r=await prepare();assert.equal(r.body.propuesta,null);
 for(const c of [{...target(channel),id:999999},{...target(channel),tipo:'VOZ'},{...target(channel),permisosGlobales:['BANEAR']}]){provider=()=>json({aclaracion:'',canales:[c]});assert.equal((await prepare()).status,503);}
 await prisma.canal.create({data:{idComunidad:community.id,nombre:'general',tipo:'TEXTO'}});r=await prepare('Renombrá general a consultas');assert.equal(r.body.propuesta,null);assert.match(r.body.aclaracion,/#\d+/);assert.equal(await prisma.propuestaCanales.count({where:{idComunidad:community.id}}),0);
});
test('plan: un actor o comunidad diferentes no pueden confirmar el identificador',async()=>{
 const id=(await prepare()).body.propuesta.id;assert.equal((await decide(id,'confirm',beto)).status,403);
 const other=(await request('/communities',{nombre:'Otra comunidad'})).body.comunidad;const r=await request(`/communities/${other.id}/channel-plans/${id}/confirm`,{});assert.equal(r.status,404);
});
test('plan: eliminación retira canales e historial sin afectar otras comunidades',async()=>{
 await send(beto.id,{idCanal:channel.id,contenido:'Historial que se elimina'});await drain();provider=()=>json({aclaracion:'',canales:[]});const r=await prepare('Eliminá el canal general y todo su historial');assert.equal((await decide(r.body.propuesta.id)).status,200);assert.equal(await prisma.canal.count({where:{idComunidad:community.id}}),0);assert.equal(await prisma.mensaje.count({where:{idCanal:channel.id}}),0);
});
test('plan: fallo intermedio revierte borrados, creaciones, propuesta y auditoría',async()=>{
 provider=()=>json({aclaracion:'',canales:[{id:null,nombre:'fallará',tipo:'TEXTO',privado:false,permisosGlobales:['ESCRIBIR']}]});const id=(await prepare('Reemplazá general por un canal nuevo llamado fallará')).body.propuesta.id;
 await prisma.$executeRawUnsafe(`CREATE FUNCTION "${schema}".fail_channel() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture rollback'; END $$`);await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_channel BEFORE INSERT ON "${schema}".canal FOR EACH ROW EXECUTE FUNCTION "${schema}".fail_channel()`);
 try{assert.equal((await decide(id)).status,500);assert.ok(await prisma.canal.findUnique({where:{id:channel.id}}));assert.equal((await prisma.propuestaCanales.findUnique({where:{id}})).estado,'PENDIENTE');assert.equal(await prisma.auditoria.count({where:{idComunidad:community.id,accion:{startsWith:'Plan IA confirmado'}}}),0);}finally{await prisma.$executeRawUnsafe(`DROP TRIGGER fail_channel ON "${schema}".canal`);await prisma.$executeRawUnsafe(`DROP FUNCTION "${schema}".fail_channel()`);}
});
test('revisión: detección es opcional, no bloquea mensajes y la caída del proveedor no crea sanciones',async()=>{
 const r=await send(beto.id,{idCanal:channel.id,contenido:'Mensaje que permanece'});await drain();await review(r.mensaje.id,async()=>{throw new Error('caída');});assert.equal(await prisma.casoRevision.count(),0);
 await request(`/communities/${community.id}/review/settings`,{activa:true},{method:'PATCH'});
 await review(r.mensaje.id,async()=>{throw new Error('caída');});assert.equal(await prisma.casoRevision.count(),0);assert.equal((await prisma.mensaje.findUnique({where:{id:r.mensaje.id}})).fechaEliminacion,null);assert.equal(await prisma.comunidadBaneo.count(),0);
});
test('revisión: señales de reglas crean un solo caso por mensaje sin guardarlo como copia',async()=>{
 await prisma.comunidad.update({where:{id:community.id},data:{revisionActiva:true}});const rule=await prisma.reglaModeracion.create({data:{idComunidad:community.id,descripcion:'acoso'}});
 const r=await send(beto.id,{idCanal:channel.id,contenido:'Contenido señalado'});await drain();const evaluate=async()=>({[`regla_${rule.id}`]:.9});await Promise.all([review(r.mensaje.id,evaluate),review(r.mensaje.id,evaluate)]);
 const cases=await prisma.casoRevision.findMany();assert.equal(cases.length,1);assert.deepEqual(cases[0].motivos,['acoso']);assert.equal(cases[0].idMensaje,r.mensaje.id);assert.equal(Object.hasOwn(cases[0],'contenido'),false);assert.equal((await prisma.mensaje.findUnique({where:{id:r.mensaje.id}})).fechaEliminacion,null);
});
test('revisión: tercera repetición en 60 segundos se señala sin expulsión ni borrado',async()=>{
 await prisma.comunidad.update({where:{id:community.id},data:{revisionActiva:true}});
 const messages=[];for(let i=0;i<3;i++)messages.push((await send(beto.id,{idCanal:channel.id,contenido:'Texto repetido'})).mensaje);await drain();
 const row=await prisma.casoRevision.findFirst({where:{idMensaje:messages[2].id}});assert.ok(row);assert.match(row.motivos[0],/Repetición/);assert.equal(await prisma.mensaje.count({where:{idCanal:channel.id,fechaEliminacion:null}}),3);assert.ok(await prisma.membresia.findUnique({where:{idComunidad_idUsuario:{idComunidad:community.id,idUsuario:beto.id}}}));
});
test('revisión: una clasificación tardía no señala un mensaje editado',async()=>{
 await prisma.comunidad.update({where:{id:community.id},data:{revisionActiva:true}});const rule=await prisma.reglaModeracion.create({data:{idComunidad:community.id,descripcion:'acoso'}});const r=await send(beto.id,{idCanal:channel.id,contenido:'Antes de editar'});await drain();
 let release,started;const ready=new Promise(r=>started=r);const work=review(r.mensaje.id,async()=>{started();return new Promise(r=>release=r);});await ready;await prisma.mensaje.update({where:{id:r.mensaje.id},data:{contenido:'Texto corregido',fechaEdicion:new Date()}});release({[`regla_${rule.id}`]:1});await work;assert.equal(await prisma.casoRevision.count(),0);
});
test('revisión: consulta requiere moderación; un caso eliminado no revela contenido',async()=>{
 const row=await flagged();for(const user of [beto,cata,null])assert.ok([401,403,404].includes((await request(`/communities/${community.id}/review/cases`,undefined,{as:user})).status));
 await prisma.mensaje.update({where:{id:row.idMensaje},data:{fechaEliminacion:new Date()}});let r=await request(`/communities/${community.id}/review/cases/${row.id}`);assert.equal(r.body.mensaje,null);assert.equal(r.body.idMensaje,null);
 await prisma.canal.delete({where:{id:channel.id}});r=await request(`/communities/${community.id}/review/cases/${row.id}`);assert.equal(r.body.idCanal,null);assert.deepEqual(r.body.motivos,['Contenido no disponible']);
});
test('revisión: descartar o cerrar sin sanción registra actor y motivo una sola vez',async()=>{
 for(const decision of ['DESCARTADO','SIN_SANCION']){const row=await flagged();const r=await resolve(row.id,decision);assert.equal(r.status,200);assert.equal(r.body.estado,decision);assert.equal((await resolve(row.id,decision)).status,200);assert.equal((await resolve(row.id,'SIN_SANCION',{motivo:'Otra resolución'})).status,409);const saved=await prisma.casoRevision.findUnique({where:{id:row.id}});assert.equal(saved.idResolutor,ana.id);assert.equal(saved.motivoResolucion,'Revisión completada');assert.equal(await prisma.auditoria.count({where:{idComunidad:community.id,accion:{startsWith:`Caso #${row.id}:`}}}),1);}
});
test('revisión: baneo confirmado y resolución son atómicos e idempotentes',async()=>{
 const row=await flagged();const body={medida:{tipo:'BANEAR',duracion:'30_MIN'}};const results=await Promise.all([resolve(row.id,'CON_MEDIDA',body),resolve(row.id,'CON_MEDIDA',body)]);assert.equal(results[0].status,200);assert.equal(results[1].status,200);assert.equal(await prisma.comunidadBaneo.count({where:{idComunidad:community.id,idUsuario:beto.id}}),1);assert.equal((await prisma.casoRevision.findUnique({where:{id:row.id}})).estado,'CON_MEDIDA');
});
test('revisión: expulsar reutiliza la medida manual sin impedir un reingreso futuro',async()=>{
 const row=await flagged();assert.equal((await resolve(row.id,'CON_MEDIDA',{medida:{tipo:'EXPULSAR'}})).status,200);assert.equal(await prisma.membresia.count({where:{idComunidad:community.id,idUsuario:beto.id}}),0);assert.equal(await prisma.comunidadBaneo.count(),0);
});
test('revisión: jerarquía y contenido eliminado impiden medidas y conservan el caso pendiente',async()=>{
 let row=await flagged(ana);assert.equal((await resolve(row.id,'CON_MEDIDA',{medida:{tipo:'BANEAR',duracion:'PERMANENTE'}})).status,403);assert.equal((await prisma.casoRevision.findUnique({where:{id:row.id}})).estado,'PENDIENTE');
 row=await flagged();await prisma.mensaje.update({where:{id:row.idMensaje},data:{fechaEliminacion:new Date()}});assert.equal((await resolve(row.id,'CON_MEDIDA',{medida:{tipo:'EXPULSAR'}})).status,409);assert.equal((await resolve(row.id,'SIN_SANCION')).status,200);
});
test('revisión: silenciar participación resuelve el caso por el mismo servicio de F-14',async()=>{
 const row=await flagged();const r=await resolve(row.id,'CON_MEDIDA',{medida:{tipo:'SILENCIAR',alcance:'AMBOS',duracion:'1_HORA'}});assert.equal(r.status,200);assert.equal(r.body.estado,'CON_MEDIDA');const silence=await prisma.silencioComunidad.findUnique({where:{idComunidad_idUsuario:{idComunidad:community.id,idUsuario:beto.id}}});assert.equal(silence.alcance,'AMBOS');assert.ok(silence.fechaVencimiento>new Date());assert.equal(await prisma.membresia.count({where:{idComunidad:community.id,idUsuario:beto.id}}),1);const {getChannelPermissions}=await import('../src/services/channelsService.js');assert.equal((await getChannelPermissions(channel.id,beto.id)).includes('ESCRIBIR'),false);
});
test('revisión: paginación y permisos retirados no exponen casos de otra comunidad',async()=>{
 for(let i=0;i<31;i++)await prisma.casoRevision.create({data:{idComunidad:community.id,idCanal:channel.id,idAutor:beto.id,motivos:['Prueba de paginación']}});
 let r=await request(`/communities/${community.id}/review/cases`);assert.equal(r.body.items.length,30);assert.ok(r.body.nextCursor);const firstIds=new Set(r.body.items.map(c=>c.id));r=await request(`/communities/${community.id}/review/cases?cursor=${r.body.nextCursor}`);assert.equal(r.body.items.length,1);assert.equal(firstIds.has(r.body.items[0].id),false);
 await prisma.membresia.delete({where:{idComunidad_idUsuario:{idComunidad:community.id,idUsuario:ana.id}}});assert.equal((await request(`/communities/${community.id}/review/cases`)).status,404);
});
test('plan: un identificador explícito desambigua nombres repetidos',async()=>{
 await prisma.canal.create({data:{idComunidad:community.id,nombre:'general',tipo:'TEXTO'}});const r=await prepare(`Renombrá general #${channel.id} a consultas`);assert.equal(r.status,200);assert.ok(r.body.propuesta);
});
