import { drainEffects } from '../src/utils/backgroundEffects.js';
import { beforeEach as isolateQuota } from 'node:test';
import { resetRateLimits } from '../src/utils/rateLimit.js';
isolateQuota(resetRateLimits);
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { PrismaClient } from '@prisma/client';
import { Server } from 'socket.io';
import { io as connectSocket } from 'socket.io-client';
import { applyMigrations } from './migrations.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('Configura TEST_DATABASE_URL con una base PostgreSQL exclusiva de pruebas');
const schema = `test_kanban_${randomUUID().replaceAll('-', '')}`;
const isolated = new URL(databaseUrl);
isolated.searchParams.set('schema', schema);
if (!isolated.searchParams.has('connection_limit')) isolated.searchParams.set('connection_limit', '5');
process.env.DATABASE_URL = isolated.href;
process.env.DIRECT_URL = isolated.href;
process.env.NODE_ENV = 'production';
process.env.RESEND_API_KEY = '';
process.env.CLOUDINARY_URL = '';

const admin = new PrismaClient({ datasourceUrl: databaseUrl });
let prisma, io, server, baseUrl, ana, dani, eli;
const sockets = [];
const events = ['community:left', 'channel:access-lost', 'community:bans-changed', 'channel-message:new'];

async function request(path, { method = 'GET', body, as } = {}) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method, headers: { ...(as ? { Cookie: as.cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function register(nombreUsuario) {
  const r = await request('/auth/register', { method: 'POST', body: { nombreUsuario, nombreVisible: nombreUsuario, correo: `${nombreUsuario}@example.test`, contrasena: 'ClaveDePrueba123' } });
  assert.equal(r.status, 201);
  return { ...r.body.usuario, cookie: r.cookie };
}
function ready(socket) {
  return new Promise((resolve, reject) => socket.timeout(4000).emit('message:send', {}, (error, reply) => {
    if (error) return reject(error);
    assert.equal(reply.error.code, 'VALIDATION_ERROR'); resolve();
  }));
}
async function socketFor(user) {
  const socket = connectSocket(baseUrl, { transports: ['websocket'], extraHeaders: { Cookie: user.cookie }, reconnection: false, forceNew: true });
  sockets.push(socket);
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  await ready(socket);
  return socket;
}
const ack = (socket, event, payload) => new Promise((resolve, reject) => socket.timeout(8000).emit(event, payload, (error, reply) => error ? reject(error) : resolve(reply)));
function capture(socket) {
  const output = [];
  socket.onAny((event, data) => { if (events.includes(event)) output.push({ event, data }); });
  return output;
}
const serverSocket = (client) => io.sockets.sockets.get(client.id);

before(async () => {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await applyMigrations(admin, schema);
  ({ prisma } = await import('../src/prisma/client.js'));
  const { app } = await import('../src/app.js');
  const { initSockets } = await import('../src/sockets/index.js');
  server = createServer(app); io = new Server(server); initSockets(io);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  ana = await register('ana'); dani = await register('dani'); eli = await register('eli');
});
beforeEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  await prisma.comunidad.deleteMany();
});
after(async () => {
  for (const socket of sockets) socket.disconnect();
  if (io) await new Promise((resolve) => io.close(resolve));
  await new Promise((resolve) => setTimeout(resolve, 50));
  await drainEffects();
  await prisma?.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
});

const community = async(owner=ana) => (await request('/communities',{method:'POST',as:owner,body:{nombre:'Kanban',tipo:'PRIVADA'}})).body.comunidad;
const member = (c,u,rol='INTEGRANTE') => prisma.membresia.create({data:{idComunidad:c.id,idUsuario:u.id,rol}});
async function conversation() {
  await prisma.amistad.upsert({where:{idUsuarioA_idUsuarioB:{idUsuarioA:ana.id,idUsuarioB:dani.id}},create:{idUsuarioA:ana.id,idUsuarioB:dani.id},update:{}});
  const r=await request('/conversations',{method:'POST',as:ana,body:{idUsuario:dani.id}});
  assert.ok([200,201].includes(r.status),JSON.stringify(r.body));
  return r.body.conversacion;
}
test('perfil: límites, color, quitar foto y preferencias privadas',async()=>{
  assert.equal((await request('/users/me',{method:'PATCH',as:ana,body:{nombreVisible:'x'}})).status,400);
  assert.equal((await request('/users/me',{method:'PATCH',as:ana,body:{informacionPersonal:'x'.repeat(191)}})).status,400);
  const changed=await request('/users/me',{method:'PATCH',as:ana,body:{colorAvatar:'#156B64',nombreVisible:'Ana'}});
  assert.equal(changed.body.usuario.colorAvatar,'#156B64');
  assert.equal((await request('/users/me',{method:'PATCH',as:ana,body:{colorAvatar:'javascript:alert(1)'}})).status,400);
  await prisma.usuario.update({where:{id:ana.id},data:{fotoUrl:'https://example.test/avatar.png'}});
  assert.equal((await request('/users/me/foto',{method:'DELETE',as:ana})).body.usuario.fotoUrl,null);
  assert.equal((await request('/users/me/preferences',{method:'PATCH',as:ana,body:{silenciarNotificaciones:true,audioInput:'device'}})).status,200);
  assert.equal((await request(`/users/${ana.id}`,{as:dani})).body.usuario.preferencias,undefined);
  await request('/users/me/preferences',{method:'PATCH',as:ana,body:{silenciarNotificaciones:false}});
});
test('correo del paso inicial y propuesta IA sin proveedor no crean datos',async()=>{
  assert.equal((await request('/auth/email-availability',{method:'POST',body:{correo:'ana@example.test'}})).body.disponible,false);
  assert.equal((await request('/auth/email-availability',{method:'POST',body:{correo:'libre@example.test'}})).body.disponible,true);
  const c=await community();
  assert.equal((await request(`/communities/${c.id}/channels/suggestion`,{method:'POST',as:ana,body:{descripcion:'Un canal para estudiar',tipo:'TEXTO'}})).status,503);
  assert.equal((await request(`/communities/${c.id}/channels/suggestion`,{method:'POST',as:eli,body:{descripcion:'Un canal para estudiar',tipo:'TEXTO'}})).status,404);
  assert.equal(await prisma.canal.count({where:{idComunidad:c.id}}),1);
});
test('búsqueda completa pagina, ignora eliminados y no cruza permisos',async()=>{
  const c=await community(),ch=await prisma.canal.findFirstOrThrow({where:{idComunidad:c.id}});
  await member(c,dani);
  const rows=[];
  for(let i=0;i<4;i++)rows.push(await prisma.mensaje.create({data:{idCanal:ch.id,idAutor:ana.id,contenido:'Historial Aguja '+i}}));
  await prisma.mensaje.update({where:{id:rows[0].id},data:{fechaEliminacion:new Date()}});
  const first=await request(`/channels/${ch.id}/messages/search?q=aguja&limit=2`,{as:dani});
  assert.equal(first.status,200);assert.equal(first.body.items.length,2);
  const second=await request(`/channels/${ch.id}/messages/search?q=aguja&limit=2&cursor=${first.body.nextCursor}`,{as:dani});
  assert.equal(second.body.items.length,1);
  assert.equal((await request(`/channels/${ch.id}/messages/search?q=aguja`,{as:eli})).status,404);
  const dm=await conversation();
  await prisma.mensaje.create({data:{idConversacion:dm.id,idAutor:ana.id,contenido:'aguja privada'}});
  assert.equal((await request(`/conversations/${dm.id}/messages/search?q=aguja`,{as:dani})).body.items.length,1);
  assert.equal((await request(`/conversations/${dm.id}/messages/search?q=aguja`,{as:eli})).status,403);
});
test('transferencia serializada: un solo propietario y jerarquía revalidada',async()=>{
  const c=await community();await member(c,dani);await member(c,eli);
  const transfer=(id,as=ana)=>request(`/communities/${c.id}/ownership`,{method:'POST',as,body:{idUsuario:id}});
  assert.equal((await transfer(ana.id)).status,400);
  const results=await Promise.all([transfer(dani.id),transfer(eli.id)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[204,403]);
  assert.equal(await prisma.membresia.count({where:{idComunidad:c.id,rol:'PROPIETARIO'}}),1);
  assert.equal((await prisma.membresia.findUniqueOrThrow({where:{idComunidad_idUsuario:{idComunidad:c.id,idUsuario:ana.id}}})).rol,'ADMIN');
});
test('notificaciones: no duplica, respeta permisos y sincroniza lectura',async()=>{
  const {notify}=await import('../src/services/notificationsService.js');
  const c=await community();await member(c,dani);
  const ch=await prisma.canal.findFirstOrThrow({where:{idComunidad:c.id}});
  const origin='test:'+randomUUID();
  await notify(dani.id,'canal',ch.id,origin);await notify(dani.id,'canal',ch.id,origin);
  const result=await request('/notifications',{as:dani});
  assert.equal(result.body.items.filter(n=>n.referencia===ch.id).length,1);
  const id=result.body.items.find(n=>n.referencia===ch.id).id;
  await request('/notifications/read',{method:'POST',as:eli,body:{id}});
  assert.equal((await prisma.notificacion.findUniqueOrThrow({where:{id}})).leida,false);
  await request('/notifications/read',{method:'POST',as:dani,body:{id}});
  assert.equal((await prisma.notificacion.findUniqueOrThrow({where:{id}})).leida,true);
  await prisma.membresia.delete({where:{idComunidad_idUsuario:{idComunidad:c.id,idUsuario:dani.id}}});
  const removed=await request('/notifications',{as:dani});
  assert.equal(removed.body.items.some(n=>n.referencia===ch.id&&n.tipo==='canal'),false);
});
test('notificaciones: un aviso por integrante con acceso, nombre del destino y lectura por destino',async()=>{
  const {notifyChannelMessage}=await import('../src/services/notificationsService.js');
  const c=await community();await member(c,dani);
  const ch=await prisma.canal.findFirstOrThrow({where:{idComunidad:c.id}});
  const messageId=Math.floor(Math.random()*1e9);
  await notifyChannelMessage(ch.id,ana.id,messageId);await notifyChannelMessage(ch.id,ana.id,messageId);
  assert.equal(await prisma.notificacion.count({where:{origen:`mensaje:${messageId}`}}),1);
  assert.equal(await prisma.notificacion.count({where:{origen:`mensaje:${messageId}`,idUsuario:ana.id}}),0);
  const list=await request('/notifications',{as:dani});
  const item=list.body.items.find(n=>n.tipo==='canal'&&n.referencia===ch.id);
  assert.equal(item.contexto.nombre,ch.nombre);assert.equal(item.contexto.idComunidad,c.id);
  assert.equal((await request('/notifications/read',{method:'POST',as:dani,body:{tipo:'canal',referencia:ch.id}})).status,204);
  assert.equal(await prisma.notificacion.count({where:{idUsuario:dani.id,tipo:'canal',referencia:ch.id,leida:false}}),0);
  assert.equal((await request('/notifications/read',{method:'POST',as:dani,body:{tipo:'canal'}})).status,400);
});
test('adjuntos: lectura autenticada, eliminación y pérdida de acceso cierran descarga',async()=>{
  const c=await community();await member(c,dani);
  const ch=await prisma.canal.findFirstOrThrow({where:{idComunidad:c.id}});
  const body=new FormData();body.append('tipo','canal');body.append('id',String(ch.id));
  body.append('archivo',new Blob([Buffer.from('%PDF-1.4\narchivo de prueba')],{type:'application/pdf'}),'prueba.pdf');
  const response=await fetch(baseUrl+'/api/files',{method:'POST',headers:{Cookie:ana.cookie},body});
  const data=await response.json();
  assert.equal(response.status,201,JSON.stringify(data));
  const id=data.mensaje.adjunto.id;
  let download=await fetch(baseUrl+'/api/files/'+id,{headers:{Cookie:dani.cookie}});
  assert.equal(download.status,200);assert.match(download.headers.get('content-disposition'),/attachment/);
  assert.equal((await fetch(baseUrl+'/api/files/'+id,{headers:{Cookie:eli.cookie}})).status,404);
  await prisma.mensaje.update({where:{id:data.mensaje.id},data:{fechaEliminacion:new Date()}});
  assert.equal((await fetch(baseUrl+'/api/files/'+id,{headers:{Cookie:ana.cookie}})).status,404);
});
test('registro de bloqueos solo es visible al equipo autorizado',async()=>{
  const c=await community();await member(c,dani);
  const ch=await prisma.canal.findFirstOrThrow({where:{idComunidad:c.id}});
  await prisma.bloqueoMensaje.create({data:{idComunidad:c.id,idCanal:ch.id,idAutor:dani.id,contenido:'contenido de prueba',motivo:'regla'}});
  assert.equal((await request(`/communities/${c.id}/moderation/blocked`,{as:ana})).body.items.length,1);
  assert.equal((await request(`/communities/${c.id}/moderation/blocked`,{as:dani})).status,403);
  assert.equal((await request(`/communities/${c.id}/moderation/blocked`,{as:eli})).status,404);
});
test('presencia conserva hasta la última pestaña e indicador de escritura exige permiso',async()=>{
  const {isOnline}=await import('../src/utils/presence.js');
  const c=await community();await member(c,dani);
  const ch=await prisma.canal.findFirstOrThrow({where:{idComunidad:c.id}});
  const [d1,d2,a,e]=await Promise.all([socketFor(dani),socketFor(dani),socketFor(ana),socketFor(eli)]);
  assert.equal(isOnline(dani.id),true);
  assert.equal((await ack(a,'channel:subscribe',{idCanal:ch.id})).ok,true);
  const event=once(a,'typing:updated');
  assert.equal((await ack(d1,'typing:update',{tipo:'canal',id:ch.id,escribiendo:true})).ok,true);
  assert.equal((await event)[0].idUsuario,dani.id);
  assert.equal((await ack(e,'typing:update',{tipo:'canal',id:ch.id,escribiendo:true})).ok,false);
  const server1=serverSocket(d1);const disconnected1=once(server1,'disconnect');d1.disconnect();await disconnected1;
  assert.equal(isOnline(dani.id),true);
  const server2=serverSocket(d2);const disconnected2=once(server2,'disconnect');d2.disconnect();await disconnected2;
  assert.equal(isOnline(dani.id),false);
});
test('llamada privada: aceptación, sesión, exclusión de terceros y cierre idempotente',async()=>{
  const {media}=await import('../src/services/mediaService.js');
  const previous={configurado:media.configurado,crearTokenPrivado:media.crearTokenPrivado,cerrarPrivada:media.cerrarPrivada};
  media.configurado=true;
  media.crearTokenPrivado=async(input)=>({url:'wss://example.test',token:'token-local',sala:input.sala});
  media.cerrarPrivada=async()=>{};
  try{
    const c=await conversation();
    const r=await request('/private-calls',{method:'POST',as:ana,body:{idConversacion:c.id,video:true}});
    assert.equal(r.status,201,JSON.stringify(r.body));const id=r.body.llamada.id;
    assert.equal((await request(`/private-calls/${id}/token`,{method:'POST',as:ana})).status,403);
    assert.equal((await request(`/private-calls/${id}/accept`,{method:'POST',as:eli})).status,404);
    assert.equal((await request(`/private-calls/${id}/accept`,{method:'POST',as:dani})).status,200);
    assert.equal((await request(`/private-calls/${id}/token`,{method:'POST',as:dani})).body.token,'token-local');
    const login=await request('/auth/login',{method:'POST',body:{identificador:'dani',contrasena:'ClaveDePrueba123'}});
    const otherSession={cookie:login.cookie};
    assert.equal((await request(`/private-calls/${id}/token`,{method:'POST',as:otherSession})).status,403);
    await request('/auth/logout',{method:'POST',as:otherSession});await drainEffects();
    assert.equal((await prisma.llamadaPrivada.findUniqueOrThrow({where:{id}})).estado,'ACEPTADA');
    const before=await prisma.mensaje.count({where:{idConversacion:c.id}});
    assert.equal((await request(`/private-calls/${id}/end`,{method:'POST',as:ana})).status,204);
    assert.equal((await request(`/private-calls/${id}/end`,{method:'POST',as:dani})).status,204);
    assert.equal(await prisma.mensaje.count({where:{idConversacion:c.id}}),before+1);
    assert.equal((await request(`/private-calls/${id}/token`,{method:'POST',as:dani})).status,403);
  }finally{Object.assign(media,previous);}
});
test('el contrato nuevo rechaza VIDEO; VOZ conserva permisos de cámara y pantalla',async()=>{
  const c=await community();
  assert.equal((await request(`/communities/${c.id}/channels`,{method:'POST',as:ana,body:{nombre:'reunión',tipo:'VIDEO'}})).status,400);
  const ch=await request(`/communities/${c.id}/channels`,{method:'POST',as:ana,body:{nombre:'reunión',tipo:'VOZ'}});
  assert.equal(ch.status,201);assert.ok(ch.body.canal.misPermisos.includes('TRANSMITIR'));
});
test('migrar un canal VIDEO conserva su id y sus grants al convertirlo a VOZ',async()=>{
  const legacy='test_video_'+randomUUID().replaceAll('-','');
  const {PrismaClient}=await import('@prisma/client');
  const old=new URL(databaseUrl);old.searchParams.set('schema',legacy);
  const client=new PrismaClient({datasourceUrl:old.href});
  try{
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${legacy}"`);
    await applyMigrations(admin,legacy,{hasta:'20261115220000_moderacion_comunidad'});
    const [community]=await admin.$queryRawUnsafe(`INSERT INTO "${legacy}"."comunidad" (nombre) VALUES ('Anterior') RETURNING id_comunidad AS id`);
    const [channel]=await admin.$queryRawUnsafe(`INSERT INTO "${legacy}"."canal" (id_comunidad,nombre,tipo) VALUES ($1,'reunión','VIDEO') RETURNING id_canal AS id`,community.id);
    await admin.$executeRawUnsafe(`INSERT INTO "${legacy}"."canal_rol" (id_canal,rol,permisos) VALUES ($1,'INTEGRANTE',ARRAY['VER','TRANSMITIR']::"${legacy}"."permiso_canal"[])`,channel.id);
    await applyMigrations(admin,legacy,{desde:'20261115220000_moderacion_comunidad'});
    const migrated=await client.canal.findUniqueOrThrow({where:{id:channel.id},include:{habilitacionesRol:true}});
    assert.equal(migrated.tipo,'VOZ');assert.equal(migrated.idComunidad,community.id);
    assert.deepEqual(migrated.habilitacionesRol[0].permisos,['VER','TRANSMITIR']);
  }finally{
    await client.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${legacy}" CASCADE`);
  }
});
test('propuesta IA: valida la respuesta estructurada y no guarda canales automáticamente',async()=>{
  const {suggestChannel}=await import('../src/services/channelSuggestionService.js');
  const {env}=await import('../src/config/env.js');
  const oldKey=env.openaiApiKey,oldModel=process.env.OPENAI_GENERATION_MODEL;
  env.openaiApiKey='test-no-real-key';process.env.OPENAI_GENERATION_MODEL='test-model';
  try{
    const c=await community(), count=await prisma.canal.count({where:{idComunidad:c.id}});
    const propuesta={nombre:'estudio',privado:false,ver:['INTEGRANTE'],usar:['INTEGRANTE'],resumen:'Canal de estudio'};
    const transport=async(url,options)=>{
      assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(options.body);
      assert.equal(body.store,false);assert.equal(body.text.format.strict,true);
      return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify(propuesta)}]}]})};
    };
    assert.deepEqual(await suggestChannel(c.id,ana.id,{descripcion:'Estudiar juntos',tipo:'TEXTO'},transport),propuesta);
    await assert.rejects(()=>suggestChannel(c.id,ana.id,{descripcion:'Estudiar juntos',tipo:'TEXTO'},async()=>({ok:true,json:async()=>({output:[{content:[{type:'output_text',text:'{"nombre":"admin","privilegios":true}'}]}]})})),e=>e.code==='AI_UNAVAILABLE');
    assert.equal(await prisma.canal.count({where:{idComunidad:c.id}}),count);
  }finally{env.openaiApiKey=oldKey;if(oldModel===undefined)delete process.env.OPENAI_GENERATION_MODEL;else process.env.OPENAI_GENERATION_MODEL=oldModel;}
});
test('llamadas simultáneas, vencidas y cierre de sala fallido convergen sin duplicar historial',async()=>{
  const {media}=await import('../src/services/mediaService.js');
  const {reconcilePrivateCalls}=await import('../src/services/privateCallsService.js');
  const previous={configurado:media.configurado,cerrarPrivada:media.cerrarPrivada,listarPrivadas:media.listarPrivadas};
  media.configurado=true;let closed=[];media.cerrarPrivada=async(name)=>{closed.push(name);};media.listarPrivadas=async()=>[];
  try{
    const c=await conversation();
    const attempts=await Promise.all([ana,dani].map(as=>request('/private-calls',{method:'POST',as,body:{idConversacion:c.id,video:false}})));
    assert.deepEqual(attempts.map(r=>r.status).sort(),[201,409]);
    const call=attempts.find(r=>r.status===201).body.llamada;
    const caller=call.idEmisor===ana.id?ana:dani;
    await prisma.llamadaPrivada.update({where:{id:call.id},data:{fechaCreacion:new Date(Date.now()-61000)}});
    await reconcilePrivateCalls();
    assert.equal((await prisma.llamadaPrivada.findUnique({where:{id:call.id}})).estado,'PERDIDA');
    const count=await prisma.mensaje.count({where:{idConversacion:c.id}});
    media.listarPrivadas=async()=>['privada-'+call.id];await reconcilePrivateCalls();
    assert.ok(closed.includes('privada-'+call.id));
    assert.equal((await request(`/private-calls/${call.id}/token`,{method:'POST',as:caller})).status,403);
    assert.equal(await prisma.mensaje.count({where:{idConversacion:c.id}}),count);
  }finally{Object.assign(media,previous);}
});
test('actividad de comunidad no revela el último mensaje de un canal privado ajeno',async()=>{
  const c=await community();await member(c,dani);
  const pub=await prisma.canal.findFirstOrThrow({where:{idComunidad:c.id}});
  const secret=await prisma.canal.create({data:{idComunidad:c.id,nombre:'reservado',tipo:'TEXTO',privado:true,posicion:1}});
  await prisma.mensaje.create({data:{idCanal:pub.id,idAutor:ana.id,contenido:'Público',fechaCreacion:new Date(Date.now()-10000)}});
  await prisma.mensaje.create({data:{idCanal:secret.id,idAutor:ana.id,contenido:'Contenido reservado'}});
  const summary=await request(`/communities/${c.id}/activity`,{as:dani});
  assert.equal(summary.status,200);assert.equal(summary.body.ultimoMensaje.contenido,'Público');
  assert.equal((await request(`/communities/${c.id}/activity`,{as:eli})).status,404);
});
test('avisos nuevos respetan silencio y conversación observada, sin borrar los anteriores',async()=>{
  const {notify,watchActivity,clearActivity}=await import('../src/services/notificationsService.js');
  const c=await conversation(),before=await prisma.notificacion.count({where:{idUsuario:dani.id}});
  const socket={id:'watch-'+randomUUID(),data:{user:{id:dani.id}}};
  watchActivity(socket,{tipo:'conversacion',referencia:c.id});
  await notify(dani.id,'conversacion',c.id,randomUUID());clearActivity(socket);
  assert.equal(await prisma.notificacion.count({where:{idUsuario:dani.id}}),before);
  await prisma.usuario.update({where:{id:dani.id},data:{preferencias:{silenciarNotificaciones:true}}});
  await notify(dani.id,'conversacion',c.id,randomUUID());
  assert.equal(await prisma.notificacion.count({where:{idUsuario:dani.id}}),before);
  await prisma.usuario.update({where:{id:dani.id},data:{preferencias:{}}});
  await notify(dani.id,'conversacion',c.id,randomUUID());
  assert.equal(await prisma.notificacion.count({where:{idUsuario:dani.id}}),before+1);
});
test('un rechazo real de moderación deja un registro y no crea un mensaje',async()=>{
  const {moderateChannelMessage}=await import('../src/services/communityModerationService.js');
  const {env}=await import('../src/config/env.js');
  const c=await community(),ch=await prisma.canal.findFirstOrThrow({where:{idComunidad:c.id}});
  await prisma.comunidad.update({where:{id:c.id},data:{moderacionActiva:true}});
  const rule=await prisma.reglaModeracion.create({data:{idComunidad:c.id,descripcion:'spam'}});
  const originalFetch=globalThis.fetch,previous=env.openaiApiKey;env.openaiApiKey='fake-local-test';
  globalThis.fetch=async(url,options)=>{
    assert.equal(url,'https://api.openai.com/v1/decisions');
    assert.equal(JSON.parse(options.body).input,'Mensaje bloqueable');
    return {ok:true,json:async()=>({answers:[{name:'regla_'+rule.id,probability:0.99}]})};
  };
  try{await assert.rejects(()=>moderateChannelMessage(ch.id,'Mensaje bloqueable',ana.id),e=>e.code==='MESSAGE_BLOCKED');}
  finally{globalThis.fetch=originalFetch;env.openaiApiKey=previous;}
  const record=await prisma.bloqueoMensaje.findFirstOrThrow({where:{idCanal:ch.id}});
  assert.equal(record.idAutor,ana.id);assert.equal(record.motivo,'spam');assert.equal(await prisma.mensaje.count({where:{idCanal:ch.id}}),0);
});
test('un MIME declarado no habilita adjuntar contenido HTML ni permite a terceros subir al canal',async()=>{
  const c=await community(),ch=await prisma.canal.findFirstOrThrow({where:{idComunidad:c.id}});
  const send=async(as,bytes)=>{
    const data=new FormData();data.append('tipo','canal');data.append('id',String(ch.id));data.append('archivo',new Blob([bytes],{type:'application/pdf'}),'archivo.pdf');
    return fetch(baseUrl+'/api/files',{method:'POST',headers:{Cookie:as.cookie},body:data});
  };
  assert.equal((await send(ana,'<html>invalido</html>')).status,400);
  assert.equal((await send(eli,'%PDF-1.4\narchivo')).status,404);
  assert.equal(await prisma.adjunto.count({where:{mensaje:{idCanal:ch.id}}}),0);
});
