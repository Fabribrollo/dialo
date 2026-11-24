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
const schema = `test_policy_${randomUUID().replaceAll('-', '')}`;
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
  await prisma.notificacion.deleteMany();
  await prisma.usuario.updateMany({data:{preferencias:{}}});
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
const create=async(c,{privado=false,tipo='TEXTO',permisosGlobales=tipo==='TEXTO'?['VER','ESCRIBIR']:['VER','HABLAR']}={})=>{
  const r=await request(`/communities/${c.id}/channels`,{method:'POST',as:ana,body:{nombre:'Canal',tipo,privado,permisosGlobales:privado?[]:permisosGlobales}});
  assert.equal(r.status,201,JSON.stringify(r.body));return r.body.canal;
};
const config=(ch,body,as=ana)=>request(`/channels/${ch.id}/access`,{method:'PUT',as,body});
const ask=(ch,as=dani)=>request(`/channels/${ch.id}/requests`,{method:'POST',as,body:{}});
const decide=(ch,id,body,as=ana)=>request(`/channels/${ch.id}/requests/${id}`,{method:'POST',as,body});
const read=(path,as=dani)=>request(path,{as});

const role=async(c,permisos)=>{
 const r=await request(`/communities/${c.id}/roles`,{method:'POST',as:ana,body:{nombre:'Equipo',permisos}});
 assert.equal(r.status,201,JSON.stringify(r.body));return r.body.rol;
};
const assign=async(c,u,r)=>{await prisma.membresiaRol.create({data:{idComunidad:c.id,idUsuario:u.id,idRol:r.id}});};

test('públicos mantienen acceso, roles se heredan íntegros y expulsar solo retira ese canal',async()=>{
 const c=await community();await member(c,dani);const ch=await create(c,{permisosGlobales:[]});
 assert.deepEqual((await request(`/channels/${ch.id}`,{as:dani})).body.canal.misPermisos,['VER']);
 const r=await role(c,['ESCRIBIR','ELIMINAR_MENSAJES']);await assign(c,dani,r);
 await config(ch,{privado:false,permisosGlobales:[]});
 assert((await request(`/channels/${ch.id}`,{as:dani})).body.canal.misPermisos.includes('ESCRIBIR'));
 assert.equal((await request(`/channels/${ch.id}/members/${dani.id}/kick`,{method:'POST',as:ana,body:{}})).status,204);
 assert.equal((await request(`/channels/${ch.id}`,{as:dani})).status,404);
 assert.equal(await prisma.membresia.count({where:{idComunidad:c.id,idUsuario:dani.id}}),1);
 await request(`/channels/${ch.id}/members/${dani.id}/restore`,{method:'POST',as:ana,body:{}});
 assert((await request(`/channels/${ch.id}`,{as:dani})).body.canal.misPermisos.includes('ESCRIBIR'));
});
test('privados exigen admisión individual y después heredan los roles sin excepciones por canal',async()=>{
 const c=await community();await member(c,dani);const ch=await create(c,{privado:true});const r=await role(c,['ESCRIBIR','GESTIONAR_CANALES']);await assign(c,dani,r);
 assert.equal((await request(`/channels/${ch.id}`,{as:dani})).status,404);
 assert.equal((await config(ch,{privado:true,roles:[{idRol:r.id,permisos:['VER']}],habilitaciones:[]})).status,400);
 await config(ch,{privado:true,habilitaciones:[{idUsuario:dani.id,permisos:['VER']}]});
 assert((await request(`/channels/${ch.id}`,{as:dani})).body.canal.misPermisos.includes('ESCRIBIR'));
 assert.equal((await config(ch,{privado:true,habilitaciones:[{idUsuario:eli.id,permisos:['VER']}]},dani)).status,403);
 assert.equal((await request(`/channels/${ch.id}/members/${dani.id}/kick`,{method:'POST',as:ana,body:{}})).status,204);
 assert.equal((await request(`/channels/${ch.id}`,{as:dani})).status,404);
 assert.equal((await request(`/channels/${ch.id}/requests`,{method:'POST',as:dani,body:{}})).status,200);
});
test('baneo solo para administración; plazos 30 minutos, 5 horas y permanente se aplican realmente',async()=>{
 const c=await community();await member(c,dani);await member(c,eli);
 const r=await role(c,['EXPULSAR','GESTIONAR_CANALES']);await assign(c,dani,r);
 assert.equal((await request(`/communities/${c.id}/roles`,{method:'POST',as:ana,body:{nombre:'Ban',permisos:['BANEAR']}})).status,400);
 assert.equal((await request(`/communities/${c.id}/bans/${eli.id}`,{method:'PUT',as:dani,body:{duracion:'30_MIN'}})).status,403);
 for(const [duration,ms] of [['30_MIN',1800000],['5_HORAS',18000000],['PERMANENTE',null]]){
  const start=Date.now();assert.equal((await request(`/communities/${c.id}/bans/${eli.id}`,{method:'PUT',as:ana,body:{duracion:duration}})).status,204);
  const ban=await prisma.comunidadBaneo.findUnique({where:{idComunidad_idUsuario:{idComunidad:c.id,idUsuario:eli.id}}});
  if(ms)assert(Math.abs(ban.fechaVencimiento.getTime()-start-ms)<5000);else assert.equal(ban.fechaVencimiento,null);
  await request(`/communities/${c.id}/bans/${eli.id}`,{method:'DELETE',as:ana});await member(c,eli);
 }
});
test('baneo vencido permite volver por invitación sin restaurar membresía automáticamente',async()=>{
 const c=await community();await member(c,dani);
 await request(`/communities/${c.id}/bans/${dani.id}`,{method:'PUT',as:ana,body:{duracion:'30_MIN'}});
 const {requireNotBanned}=await import('../src/utils/communityBans.js');await assert.rejects(requireNotBanned(prisma,c.id,dani.id),e=>e.code==='COMMUNITY_BANNED');
 await prisma.comunidadBaneo.update({where:{idComunidad_idUsuario:{idComunidad:c.id,idUsuario:dani.id}},data:{fechaVencimiento:new Date(Date.now()-1000)}});
 await requireNotBanned(prisma,c.id,dani.id);assert.equal(await prisma.membresia.count({where:{idComunidad:c.id,idUsuario:dani.id}}),0);
 assert.equal((await request(`/communities/${c.id}/bans`,{as:ana})).body.items.length,0);
});
test('archivar y ocultar son por cuenta, conservan amistad y no alteran la conversación de la otra persona',async()=>{
 const [a,b]=[ana.id,dani.id].sort((x,y)=>x-y);await prisma.amistad.create({data:{idUsuarioA:a,idUsuarioB:b}});
 const conv=await prisma.conversacionPrivada.create({data:{idUsuarioA:a,idUsuarioB:b,fechaCreacion:new Date(Date.now()-10000)}});
 assert.equal((await request(`/chat-state/conversacion/${conv.id}`,{method:'PATCH',as:dani,body:{archivado:true}})).status,200);
 assert.equal((await request(`/chat-state/conversacion/${conv.id}`,{method:'PATCH',as:eli,body:{archivado:true}})).status,404);
 await prisma.mensaje.create({data:{idConversacion:conv.id,idAutor:ana.id,contenido:'Nuevo'}});
 const {notify}=await import('../src/services/notificationsService.js');await notify(dani.id,'conversacion',conv.id,'mensaje:prueba');
 assert.equal(await prisma.notificacion.count({where:{idUsuario:dani.id,tipo:'conversacion',referencia:conv.id}}),0);
 let state=(await request('/chat-state',{as:dani})).body.items.find(s=>s.tipo==='conversacion'&&s.destino===conv.id);assert.equal(state.noLeidos,1);assert.equal(state.archivado,true);
 await request(`/chat-state/conversacion/${conv.id}`,{method:'PATCH',as:dani,body:{oculto:true}});
 assert.equal(await prisma.amistad.count({where:{idUsuarioA:a,idUsuarioB:b}}),1);assert.equal(await prisma.conversacionPrivada.count({where:{id:conv.id}}),1);
 assert.equal((await request('/chat-state',{as:ana})).body.items.find(s=>s.destino===conv.id&&s.tipo==='conversacion').oculto,false);
 await request(`/chat-state/conversacion/${conv.id}`,{method:'PATCH',as:dani,body:{leido:true,archivado:false}});
 state=(await request('/chat-state',{as:dani})).body.items.find(s=>s.tipo==='conversacion'&&s.destino===conv.id);assert.equal(state.noLeidos,0);
});
test('archivar comunidad silencia sus canales y el contador no incluye canales privados ajenos',async()=>{
 const c=await community();await member(c,dani);const pub=await create(c);const secret=await create(c,{privado:true});
 await request(`/chat-state/comunidad/${c.id}`,{method:'PATCH',as:dani,body:{archivado:true}});
 await prisma.mensaje.create({data:{idCanal:secret.id,idAutor:ana.id,contenido:'Secreto'}});
 const message=await prisma.mensaje.create({data:{idCanal:pub.id,idAutor:ana.id,contenido:'Visible',fechaCreacion:new Date(Date.now()+10)}});
 const {notifyChannelMessage}=await import('../src/services/notificationsService.js');await notifyChannelMessage(pub.id,ana.id,message.id);
 assert.equal(await prisma.notificacion.count({where:{idUsuario:dani.id,tipo:'canal',referencia:pub.id}}),0);
 assert.equal((await request('/chat-state',{as:dani})).body.items.find(s=>s.tipo==='comunidad'&&s.destino===c.id).noLeidos,1);
 assert.equal((await request(`/chat-state/canal/${secret.id}`,{method:'PATCH',as:dani,body:{leido:true}})).status,404);
});
test('videos MP4 hasta 2 MB, rangos autenticados y descarga explícita; rechaza exceso y MIME falso',async()=>{
 const c=await community();await member(c,dani);const ch=await create(c);
 const upload=async(bytes,name='video.mp4',declared='video/mp4')=>{const body=new FormData();body.append('tipo','canal');body.append('id',String(ch.id));body.append('archivo',new Blob([bytes],{type:declared}),name);return fetch(`${baseUrl}/api/files`,{method:'POST',headers:{Cookie:ana.cookie},body});};
 const bytes=Buffer.alloc(64);bytes.writeUInt32BE(24,0);bytes.write('ftypisom',4);
 const created=await upload(bytes);assert.equal(created.status,201);const file=(await created.json()).mensaje.adjunto;
 const response=await fetch(`${baseUrl}/api/files/${file.id}`,{headers:{Cookie:dani.cookie,Range:'bytes=0-15'}});assert.equal(response.status,206);assert.equal(response.headers.get('content-type'),'video/mp4');assert.match(response.headers.get('content-disposition'),/^inline/);assert.equal((await response.arrayBuffer()).byteLength,16);
 assert.equal((await fetch(`${baseUrl}/api/files/${file.id}`,{headers:{Cookie:eli.cookie}})).status,404);
 const download=await fetch(`${baseUrl}/api/files/${file.id}?download=1`,{headers:{Cookie:ana.cookie}});assert.match(download.headers.get('content-disposition'),/^attachment/);
 const large=Buffer.alloc(2*1024*1024+1);bytes.copy(large);assert.equal((await upload(large)).status,400);
 assert.equal((await upload(Buffer.from('<html>invalido</html>'))).status,400);
});

test('la migración conserva admisiones privadas por rol y denegaciones públicas, sin delegar baneos',async()=>{
 const legacy='test_harmony_migration_'+randomUUID().replaceAll('-','');const url=new URL(databaseUrl);url.searchParams.set('schema',legacy);const db=new PrismaClient({datasourceUrl:url.href});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${legacy}"`);await applyMigrations(admin,legacy,{hasta:'20261121011000_moderacion_privada_previa'});
  const u=await db.usuario.create({select:{id:true},data:{nombreUsuario:'legacy',nombreVisible:'Legacy',correo:'legacy@test.test',hashContrasena:'test'}});
  const [c]=await admin.$queryRawUnsafe(`INSERT INTO "${legacy}".comunidad(nombre) VALUES ('Anterior') RETURNING id_comunidad AS id`);await db.membresia.create({data:{idComunidad:c.id,idUsuario:u.id,rol:'INTEGRANTE'}});
  const role=await db.rolPersonalizado.create({data:{idComunidad:c.id,nombre:'Equipo',permisos:['ESCRIBIR','BANEAR']}});await db.membresiaRol.create({data:{idComunidad:c.id,idUsuario:u.id,idRol:role.id}});
  const privateCh=await db.canal.create({data:{idComunidad:c.id,nombre:'Privado',privado:true}});await db.canalRolPersonalizado.create({data:{idCanal:privateCh.id,idComunidad:c.id,idRol:role.id,permisos:['VER','ESCRIBIR']}});
  const publicCh=await db.canal.create({data:{idComunidad:c.id,nombre:'Público',privado:false}});await db.canalUsuario.create({data:{idCanal:publicCh.id,idComunidad:c.id,idUsuario:u.id,permisos:[]}});
  await applyMigrations(admin,legacy,{desde:'20261121011000_moderacion_privada_previa'});
  assert((await db.canalUsuario.findUnique({where:{idCanal_idUsuario:{idCanal:privateCh.id,idUsuario:u.id}}})).permisos.includes('VER'));
  assert.equal(await db.canalExpulsion.count({where:{idCanal:publicCh.id,idUsuario:u.id}}),1);assert.deepEqual((await db.rolPersonalizado.findUnique({where:{id:role.id}})).permisos,['ESCRIBIR']);assert.equal(await db.canalRolPersonalizado.count(),0);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${legacy}" CASCADE`);}
});

test('envío múltiple guarda texto y recursos juntos; un archivo inválido o falta de permisos no deja mensajes parciales',async()=>{
 const c=await community();await member(c,dani);const ch=await create(c);
 const png=Buffer.from([137,80,78,71,13,10,26,10,1,2]);
 async function batch(files,as=ana,texto='Una explicación para las fotos'){
  const body=new FormData();body.append('tipo','canal');body.append('id',String(ch.id));body.append('texto',texto);
  for(const [i,bytes] of files.entries())body.append('archivo',new Blob([bytes],{type:'image/png'}),`foto${i}.png`);
  const res=await fetch(`${baseUrl}/api/files/batch`,{method:'POST',headers:{Cookie:as.cookie},body});return {status:res.status,body:await res.json()};
 }
 const sent=await batch([png,png]);assert.equal(sent.status,201);assert.equal(sent.body.mensajes.length,2);assert.equal(sent.body.mensajes[0].contenido,'Una explicación para las fotos');assert.equal(sent.body.mensajes[1].contenido,'Archivo adjunto');
 const total=await prisma.mensaje.count({where:{idCanal:ch.id}});
 assert.equal((await batch([png,Buffer.from('<html>falso</html>')])).status,400);assert.equal(await prisma.mensaje.count({where:{idCanal:ch.id}}),total);
 assert.equal((await batch(Array(7).fill(png))).status,400);assert.equal((await batch([png],eli)).status,404);
 assert.equal((await batch([png],ana,'a'.repeat(2001))).status,400);assert.equal(await prisma.mensaje.count({where:{idCanal:ch.id}}),total);
 await prisma.comunidad.update({where:{id:c.id},data:{moderacionActiva:true}});const rule=await prisma.reglaModeracion.create({data:{idComunidad:c.id,descripcion:'violencia'}});
 const {env}=await import('../src/config/env.js');const originalFetch=globalThis.fetch,previousKey=env.openaiApiKey;env.openaiApiKey='fake-local-test';
 globalThis.fetch=async(url,options)=>url==='https://api.openai.com/v1/decisions'?{ok:true,json:async()=>({answers:[{name:'regla_'+rule.id,probability:0.99}]})}:originalFetch(url,options);
 try{const blocked=await batch([png],ana,'violencia');assert.equal(blocked.status,422);assert.equal(await prisma.mensaje.count({where:{idCanal:ch.id}}),total);}
 finally{globalThis.fetch=originalFetch;env.openaiApiKey=previousKey;}
});

test('registros de llamadas inmutables en DTO y servidor; el texto parecido de un usuario sigue siendo editable',async()=>{
 const [a,b]=[ana.id,dani.id].sort((x,y)=>x-y);await prisma.amistad.upsert({where:{idUsuarioA_idUsuarioB:{idUsuarioA:a,idUsuarioB:b}},create:{idUsuarioA:a,idUsuarioB:b},update:{}});
 const conv=await prisma.conversacionPrivada.upsert({where:{idUsuarioA_idUsuarioB:{idUsuarioA:a,idUsuarioB:b}},create:{idUsuarioA:a,idUsuarioB:b},update:{}});
 const record=await prisma.mensaje.create({data:{idConversacion:conv.id,idAutor:ana.id,registroLlamada:true,contenido:'Llamada de voz: finalizada.'}});
 const {editMessage,deleteMessage}=await import('../src/services/messagesService.js');
 await assert.rejects(editMessage(ana.id,{idMensaje:record.id,contenido:'cambio'}),e=>e.code==='CALL_RECORD_IMMUTABLE');await assert.rejects(deleteMessage(ana.id,{idMensaje:record.id}),e=>e.code==='CALL_RECORD_IMMUTABLE');
 const hist=await request(`/conversations/${conv.id}/messages`,{as:ana});assert.equal(hist.body.items.find(m=>m.id===record.id).registroLlamada,true);
 const normal=await prisma.mensaje.create({data:{idConversacion:conv.id,idAutor:ana.id,contenido:'Llamada de voz: finalizada.'}});
 assert.equal((await editMessage(ana.id,{idMensaje:normal.id,contenido:'Es un mensaje normal'})).mensaje.contenido,'Es un mensaje normal');
});

test('migración recupera el registro de una llamada terminada y conserva un texto normal',async()=>{
 const legacy='test_call_record_'+randomUUID().replaceAll('-','');const url=new URL(databaseUrl);url.searchParams.set('schema',legacy);const db=new PrismaClient({datasourceUrl:url.href});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${legacy}"`);await applyMigrations(admin,legacy,{hasta:'20261121190000_armonia_chat'});
  const a=await db.usuario.create({select:{id:true},data:{nombreUsuario:'uno',nombreVisible:'Uno',correo:'uno@test.test',hashContrasena:'x'}}),b=await db.usuario.create({select:{id:true},data:{nombreUsuario:'dos',nombreVisible:'Dos',correo:'dos@test.test',hashContrasena:'x'}});
  const c=await db.conversacionPrivada.create({data:{idUsuarioA:a.id,idUsuarioB:b.id}});const end=new Date();await db.llamadaPrivada.create({data:{id:randomUUID(),idConversacion:c.id,idEmisor:a.id,idReceptor:b.id,estado:'FINALIZADA',fechaFin:end}});
  // SQL previo a la migración: el cliente actual ya conoce la columna nueva.
  const [record]=await admin.$queryRawUnsafe(`INSERT INTO "${legacy}"."mensaje" (id_conversacion,id_autor,contenido,fecha_creacion) VALUES ($1,$2,'Llamada de voz: finalizada.',$3) RETURNING id_mensaje AS id`,c.id,a.id,end);
  const [normal]=await admin.$queryRawUnsafe(`INSERT INTO "${legacy}"."mensaje" (id_conversacion,id_autor,contenido,fecha_creacion) VALUES ($1,$2,'Llamada de voz: finalizada.',$3) RETURNING id_mensaje AS id`,c.id,a.id,new Date(end.getTime()-60000));
  await applyMigrations(admin,legacy,{desde:'20261121190000_armonia_chat'});assert.equal((await db.mensaje.findUnique({where:{id:record.id}})).registroLlamada,true);assert.equal((await db.mensaje.findUnique({where:{id:normal.id}})).registroLlamada,false);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${legacy}" CASCADE`);}
});

test('un reintento de mensaje recupera la misma fila, no resucita eliminados y no admite reutilizar la clave con otro texto',async()=>{
 const [a,b]=[ana.id,dani.id].sort((x,y)=>x-y);await prisma.amistad.upsert({where:{idUsuarioA_idUsuarioB:{idUsuarioA:a,idUsuarioB:b}},create:{idUsuarioA:a,idUsuarioB:b},update:{}});
 const c=await prisma.conversacionPrivada.upsert({where:{idUsuarioA_idUsuarioB:{idUsuarioA:a,idUsuarioB:b}},create:{idUsuarioA:a,idUsuarioB:b},update:{}});
 const {sendMessage,deleteMessage}=await import('../src/services/messagesService.js');const key=randomUUID(),payload={idConversacion:c.id,contenido:'Una sola vez',idEnvio:key};
 const [one,two]=await Promise.all([sendMessage(ana.id,payload),sendMessage(ana.id,payload)]);assert.equal(one.mensaje.id,two.mensaje.id);assert.equal(await prisma.mensaje.count({where:{idConversacion:c.id,contenido:'Una sola vez'}}),1);
 await assert.rejects(sendMessage(ana.id,{...payload,contenido:'Otra cosa'}),e=>e.code==='SEND_KEY_CONFLICT');
 await deleteMessage(ana.id,{idMensaje:one.mensaje.id});const replay=await sendMessage(ana.id,payload);assert.equal(replay.mensaje.eliminado,true);assert.equal(replay.mensaje.contenido,null);
 await prisma.amistad.delete({where:{idUsuarioA_idUsuarioB:{idUsuarioA:a,idUsuarioB:b}}});await assert.rejects(sendMessage(ana.id,payload),e=>e.code==='NOT_FRIENDS');
});
test('la tanda con clave compartida se confirma una vez y el replay revalida acceso',async()=>{
 const c=await community();await member(c,dani);const ch=await create(c);const key=randomUUID(),png=Buffer.from([137,80,78,71,13,10,26,10]);
 async function upload(text='Texto',as=ana){const form=new FormData();form.append('tipo','canal');form.append('id',String(ch.id));form.append('texto',text);form.append('idEnvio',key);for(let i=0;i<2;i++)form.append('archivo',new Blob([png],{type:'image/png'}),`foto${i}.png`);const res=await fetch(`${baseUrl}/api/files/batch`,{method:'POST',headers:{Cookie:as.cookie},body:form});return {status:res.status,body:await res.json()};}
 const first=await upload(),again=await upload();assert.equal(first.status,201);assert.deepEqual(again.body.mensajes.map(m=>m.id),first.body.mensajes.map(m=>m.id));assert.equal(await prisma.mensaje.count({where:{idCanal:ch.id}}),2);assert.equal((await upload('Cambiado')).status,409);
 await prisma.membresia.update({where:{idComunidad_idUsuario:{idComunidad:c.id,idUsuario:ana.id}},data:{rol:'INTEGRANTE'}});await prisma.canal.update({where:{id:ch.id},data:{permisosGlobales:[]}});assert.equal((await upload()).status,403);
});
test('el resumen de permisos de integrantes usa las mismas reglas efectivas y describe roles heredados',async()=>{
 const c=await community();await member(c,dani);const ch=await create(c,{tipo:'VOZ',permisosGlobales:['HABLAR']});const role=await prisma.rolPersonalizado.create({data:{idComunidad:c.id,nombre:'Cámaras',permisos:['CAMARA']}});await prisma.membresiaRol.create({data:{idComunidad:c.id,idUsuario:dani.id,idRol:role.id}});
 const response=await request(`/channels/${ch.id}/members/management`,{as:ana});assert.equal(response.status,200);const row=response.body.items.find(m=>m.usuario.id===dani.id);assert(row.permisosEfectivos.includes('CAMARA'));assert(row.permisosEfectivos.includes('HABLAR'));assert.equal(row.origenPermisos.roles[0].nombre,'Cámaras');assert.equal((await request(`/channels/${ch.id}/members/management`,{as:dani})).status,403);
});
test('el reintento de canal conserva ID y contenido vigente incluso después de editar o eliminar',async()=>{
 const c=await community();const ch=await create(c);const {sendChannelMessage,editChannelMessage,deleteChannelMessage}=await import('../src/services/channelMessagesService.js');const payload={idCanal:ch.id,contenido:'Texto original',idEnvio:randomUUID()};const one=await sendChannelMessage(ana.id,payload);await editChannelMessage(ana.id,{idMensaje:one.mensaje.id,contenido:'Texto editado'});const replay=await sendChannelMessage(ana.id,payload);assert.equal(replay.mensaje.id,one.mensaje.id);assert.equal(replay.mensaje.contenido,'Texto editado');assert.equal(await prisma.mensaje.count({where:{idCanal:ch.id}}),1);await deleteChannelMessage(ana.id,{idMensaje:one.mensaje.id});assert.equal((await sendChannelMessage(ana.id,payload)).mensaje.eliminado,true);
});

test('cuatro o más adjuntos comparten grupo persistente, no se editan y permiten eliminar un recurso',async()=>{
 const c=await community(),ch=await create(c),png=Buffer.from([137,80,78,71,13,10,26,10]);
 const upload=async total=>{const form=new FormData();form.append('tipo','canal');form.append('id',String(ch.id));form.append('texto','Recursos del día');form.append('idEnvio',randomUUID());for(let i=0;i<total;i++)form.append('archivo',new Blob([png],{type:'image/png'}),`foto${i}.png`);const r=await fetch(`${baseUrl}/api/files/batch`,{method:'POST',headers:{Cookie:ana.cookie},body:form});assert.equal(r.status,201);return (await r.json()).mensajes;};
 const small=await upload(3);assert(small.every(m=>!m.grupoAdjuntos));const group=await upload(5);assert.equal(new Set(group.map(m=>m.grupoAdjuntos.id)).size,1);assert(group.every(m=>m.grupoAdjuntos.total===5));
 const second=await upload(4);assert.notEqual(second[0].grupoAdjuntos.id,group[0].grupoAdjuntos.id);
 const {editChannelMessage,deleteChannelMessage}=await import('../src/services/channelMessagesService.js');await assert.rejects(editChannelMessage(ana.id,{idMensaje:group[0].id,contenido:'cambio'}),e=>e.code==='ATTACHMENT_NOT_EDITABLE');await deleteChannelMessage(ana.id,{idMensaje:group[0].id});assert.equal((await prisma.mensaje.findUnique({where:{id:group[0].id}})).fechaEliminacion instanceof Date,true);assert.equal(await prisma.mensaje.count({where:{idGrupoAdjuntos:group[0].grupoAdjuntos.id,fechaEliminacion:null}}),4);
});
test('adjunto privado rechaza edición de texto y conserva la eliminación del autor',async()=>{
 const [a,b]=[ana.id,dani.id].sort((x,y)=>x-y);await prisma.amistad.upsert({where:{idUsuarioA_idUsuarioB:{idUsuarioA:a,idUsuarioB:b}},create:{idUsuarioA:a,idUsuarioB:b},update:{}});const c=await prisma.conversacionPrivada.upsert({where:{idUsuarioA_idUsuarioB:{idUsuarioA:a,idUsuarioB:b}},create:{idUsuarioA:a,idUsuarioB:b},update:{}});
 const msg=await prisma.mensaje.create({data:{idConversacion:c.id,idAutor:ana.id,contenido:'Una foto',adjunto:{create:{nombre:'foto.png',tipo:'image/png',datos:Buffer.from([137,80,78,71,13,10,26,10])}}}});const {editMessage,deleteMessage}=await import('../src/services/messagesService.js');await assert.rejects(editMessage(ana.id,{idMensaje:msg.id,contenido:'cambio'}),e=>e.code==='ATTACHMENT_NOT_EDITABLE');await deleteMessage(ana.id,{idMensaje:msg.id});assert.notEqual((await prisma.mensaje.findUnique({where:{id:msg.id}})).fechaEliminacion,null);
});
test('la migración recupera grupos históricos por recibo y no agrupa mensajes sin evidencia',async()=>{
 const legacy='test_albums_'+randomUUID().replaceAll('-',''),url=new URL(databaseUrl);url.searchParams.set('schema',legacy);const db=new PrismaClient({datasourceUrl:url.href});
 try{await admin.$executeRawUnsafe(`CREATE SCHEMA "${legacy}"`);await applyMigrations(admin,legacy,{hasta:'20261122020000_envios_confirmados'});const a=await db.usuario.create({select:{id:true},data:{nombreUsuario:'ana',nombreVisible:'Ana',correo:'ana@album.test',hashContrasena:'x'}}),b=await db.usuario.create({select:{id:true},data:{nombreUsuario:'beto',nombreVisible:'Beto',correo:'beto@album.test',hashContrasena:'x'}}),c=await db.conversacionPrivada.create({data:{idUsuarioA:a.id,idUsuarioB:b.id}}),ids=[];
 for(let i=0;i<5;i++){const [m]=await admin.$queryRawUnsafe(`INSERT INTO "${legacy}"."mensaje" (id_autor,id_conversacion,contenido) VALUES ($1,$2,'Archivo adjunto') RETURNING id_mensaje AS id`,a.id,c.id);ids.push(m.id);await db.adjunto.create({data:{idMensaje:m.id,nombre:'foto.png',tipo:'image/png',datos:Buffer.from('test')}});}
 const key=randomUUID();await db.envioConfirmado.create({data:{idAutor:a.id,clave:key,huella:'test',mensajes:ids.slice(0,4)}});await applyMigrations(admin,legacy,{desde:'20261122020000_envios_confirmados'});const rows=await db.mensaje.findMany({orderBy:{id:'asc'}});assert(rows.slice(0,4).every(m=>m.idGrupoAdjuntos===key&&m.cantidadGrupoAdjuntos===4));assert.equal(rows[4].idGrupoAdjuntos,null);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${legacy}" CASCADE`);}
});

test('reacciones persistidas: una por usuario, reemplazo, retiro y rechazo entre destinos',async()=>{
 const c=await community();await member(c,dani);const ch=await create(c);const {sendChannelMessage}=await import('../src/services/channelMessagesService.js');const {interactMessage}=await import('../src/services/messageInteractionsService.js');const m=(await sendChannelMessage(ana.id,{idCanal:ch.id,contenido:'Hola'})).mensaje;
 const change=(actor,emoji)=>interactMessage(actor,{accion:'reaccionar',idMensaje:m.id,emoji},'canal');
 await Promise.all([change(ana.id,'👍'),change(dani.id,'👍')]);let saved=await change(dani.id,'❤️');assert.equal(saved.mensaje.reacciones.length,2);assert.deepEqual(saved.mensaje.reacciones.find(r=>r.emoji==='❤️').usuarios,[dani.id]);assert.equal(await prisma.reaccionMensaje.count({where:{idMensaje:m.id}}),2);
 await change(dani.id,null);saved=await change(ana.id,null);assert.deepEqual(saved.mensaje.reacciones,[]);
 await assert.rejects(interactMessage(eli.id,{accion:'reaccionar',idMensaje:m.id,emoji:'👍'},'canal'));
 await assert.rejects(interactMessage(ana.id,{accion:'reaccionar',idMensaje:m.id,emoji:'👍'},'conversacion'),e=>e.code==='MESSAGE_NOT_FOUND');
 await prisma.canal.update({where:{id:ch.id},data:{permisosGlobales:[]}});await assert.rejects(change(dani.id,'👍'),e=>e.code==='NO_PERMISSION');
});
test('fijados de canal requieren gestionar canales, sobreviven al historial y excluyen eliminados',async()=>{
 const c=await community();await member(c,dani);const ch=await create(c);const {sendChannelMessage,deleteChannelMessage}=await import('../src/services/channelMessagesService.js');const {interactMessage}=await import('../src/services/messageInteractionsService.js');const m=(await sendChannelMessage(ana.id,{idCanal:ch.id,contenido:'Importante'})).mensaje;
 const pin={accion:'fijar',idMensaje:m.id,fijado:true};await assert.rejects(interactMessage(dani.id,pin,'canal'),e=>e.code==='NO_PERMISSION');assert((await interactMessage(ana.id,pin,'canal')).mensaje.fechaFijado);
 let list=await interactMessage(dani.id,{accion:'fijados',idDestino:ch.id},'canal');assert.equal(list.items[0].id,m.id);assert.equal((await interactMessage(ana.id,{...pin,fijado:false},'canal')).mensaje.fechaFijado,null);assert.equal((await interactMessage(dani.id,{accion:'fijados',idDestino:ch.id},'canal')).items.length,0);
 await interactMessage(ana.id,pin,'canal');await deleteChannelMessage(ana.id,{idMensaje:m.id});assert.equal((await interactMessage(dani.id,{accion:'fijados',idDestino:ch.id},'canal')).items.length,0);await assert.rejects(interactMessage(ana.id,pin,'canal'),e=>e.code==='MESSAGE_DELETED');
});
test('respuestas citan el mensaje vigente, ocultan lo eliminado y no cruzan canales',async()=>{
 const c=await community(),ch=await create(c),other=await create(c);const {sendChannelMessage,editChannelMessage,deleteChannelMessage,listChannelMessages}=await import('../src/services/channelMessagesService.js');const m=(await sendChannelMessage(ana.id,{idCanal:ch.id,contenido:'Original'})).mensaje;
 const reply=(await sendChannelMessage(ana.id,{idCanal:ch.id,contenido:'Respuesta',idRespuesta:m.id,idEnvio:randomUUID()})).mensaje;assert.equal(reply.respuesta.contenido,'Original');assert.equal(reply.respuesta.id,m.id);
 await assert.rejects(sendChannelMessage(ana.id,{idCanal:other.id,contenido:'Otro canal',idRespuesta:m.id}),e=>e.code==='INVALID_REPLY');
 await editChannelMessage(ana.id,{idMensaje:m.id,contenido:'Actualizado'});assert.equal((await listChannelMessages(ch.id,ana.id)).items.find(x=>x.id===reply.id).respuesta.contenido,'Actualizado');await deleteChannelMessage(ana.id,{idMensaje:m.id});const quoted=(await listChannelMessages(ch.id,ana.id)).items.find(x=>x.id===reply.id).respuesta;assert.equal(quoted.contenido,null);assert.equal(quoted.eliminado,true);await assert.rejects(sendChannelMessage(ana.id,{idCanal:ch.id,contenido:'No',idRespuesta:m.id}),e=>e.code==='INVALID_REPLY');
});
test('privados: responde, reacciona y fija solo un participante; llamada inmutable y validación de payload',async()=>{
 const a=Math.min(ana.id,dani.id),b=Math.max(ana.id,dani.id);await prisma.amistad.upsert({where:{idUsuarioA_idUsuarioB:{idUsuarioA:a,idUsuarioB:b}},create:{idUsuarioA:a,idUsuarioB:b},update:{}});const conv=await prisma.conversacionPrivada.upsert({where:{idUsuarioA_idUsuarioB:{idUsuarioA:a,idUsuarioB:b}},create:{idUsuarioA:a,idUsuarioB:b},update:{}});const {sendMessage}=await import('../src/services/messagesService.js');const {interactMessage,interactionSchema}=await import('../src/services/messageInteractionsService.js');const m=(await sendMessage(ana.id,{idConversacion:conv.id,contenido:'Privado'})).mensaje;
 assert.equal((await sendMessage(dani.id,{idConversacion:conv.id,contenido:'Te respondo',idRespuesta:m.id})).mensaje.respuesta.id,m.id);await interactMessage(dani.id,{accion:'reaccionar',idMensaje:m.id,emoji:'😂'},'conversacion');await interactMessage(dani.id,{accion:'fijar',idMensaje:m.id,fijado:true},'conversacion');assert.equal((await interactMessage(ana.id,{accion:'fijados',idDestino:conv.id},'conversacion')).items.length,1);await assert.rejects(interactMessage(eli.id,{accion:'fijados',idDestino:conv.id},'conversacion'));
 const call=await prisma.mensaje.create({data:{idAutor:ana.id,idConversacion:conv.id,contenido:'Llamada terminada',registroLlamada:true}});await assert.rejects(interactMessage(ana.id,{accion:'reaccionar',idMensaje:call.id,emoji:'👍'},'conversacion'),e=>e.code==='CALL_RECORD_IMMUTABLE');await assert.rejects(sendMessage(ana.id,{idConversacion:conv.id,contenido:'No',idRespuesta:call.id}),e=>e.code==='INVALID_REPLY');assert.equal(interactionSchema.safeParse({accion:'reaccionar',idMensaje:m.id,emoji:'cualquier cosa'}).success,false);assert.equal(interactionSchema.safeParse({accion:'fijar',idMensaje:m.id}).success,false);
});
test('socket autenticado transmite reacciones y fijados al otro participante',async()=>{
 const c=await community();await member(c,dani);const ch=await create(c);const {sendChannelMessage}=await import('../src/services/channelMessagesService.js');const m=(await sendChannelMessage(ana.id,{idCanal:ch.id,contenido:'En vivo'})).mensaje;const socket=await socketFor(dani),owner=await socketFor(ana);
 const ack=(s,event,data)=>new Promise((resolve,reject)=>s.timeout(4000).emit(event,data,(e,r)=>e?reject(e):resolve(r)));
 assert.equal((await ack(socket,'channel:subscribe',{idCanal:ch.id})).ok,true);let receive=once(socket,'channel-message:updated');const result=await ack(owner,'channel-message:interact',{accion:'reaccionar',idMensaje:m.id,emoji:'👍'});assert.equal(result.ok,true);assert.deepEqual((await receive)[0].mensaje.reacciones,[{emoji:'👍',usuarios:[ana.id]}]);assert.equal((await ack(owner,'channel-message:interact',{accion:'fijar',idMensaje:m.id,fijado:true})).ok,true);assert.equal((await ack(socket,'channel-message:interact',{accion:'fijados',idDestino:ch.id})).data.items[0].id,m.id);
});
test('responder con adjuntos mantiene el recibo aunque luego se elimine la referencia y limita fijados',async()=>{
 const c=await community(),ch=await create(c);const {sendChannelMessage,deleteChannelMessage}=await import('../src/services/channelMessagesService.js');const {interactMessage}=await import('../src/services/messageInteractionsService.js');const m=(await sendChannelMessage(ana.id,{idCanal:ch.id,contenido:'Referencia'})).mensaje;const key=randomUUID();
 const upload=async()=>{const form=new FormData();form.append('tipo','canal');form.append('id',String(ch.id));form.append('idEnvio',key);form.append('idRespuesta',String(m.id));form.append('texto','Con una foto');form.append('archivo',new Blob([Buffer.from([137,80,78,71,13,10,26,10])],{type:'image/png'}),'foto.png');const r=await fetch(`${baseUrl}/api/files/batch`,{method:'POST',headers:{Cookie:ana.cookie},body:form});return {status:r.status,data:await r.json()};};
 const one=await upload();assert.equal(one.status,201);assert.equal(one.data.mensajes[0].respuesta.id,m.id);await deleteChannelMessage(ana.id,{idMensaje:m.id});const retry=await upload();assert.equal(retry.status,201);assert.equal(retry.data.mensajes[0].id,one.data.mensajes[0].id);assert.equal(retry.data.mensajes[0].respuesta.contenido,null);
 await prisma.mensaje.createMany({data:Array.from({length:50},(_,i)=>({idCanal:ch.id,idAutor:ana.id,contenido:`Fijado ${i}`,fechaFijado:new Date()}))});await assert.rejects(interactMessage(ana.id,{accion:'fijar',idMensaje:one.data.mensajes[0].id,fijado:true},'canal'),e=>e.code==='PIN_LIMIT');
});

test('interacciones respetan el esquema de Prisma aunque search_path no incluya sus tablas',async()=>{
 const {interactMessage}=await import('../src/services/messageInteractionsService.js');
 const {sendChannelMessage}=await import('../src/services/channelMessagesService.js');
 const restrictedPath=tx=>tx.$executeRaw`SET LOCAL search_path TO pg_catalog`;
 const c=await community(),ch=await create(c);
 const channelMessage=(await sendChannelMessage(ana.id,{idCanal:ch.id,contenido:'Esquema explícito'})).mensaje;
 const a=Math.min(ana.id,dani.id),b=Math.max(ana.id,dani.id);
 await prisma.amistad.upsert({where:{idUsuarioA_idUsuarioB:{idUsuarioA:a,idUsuarioB:b}},create:{idUsuarioA:a,idUsuarioB:b},update:{}});
 const conv=await prisma.conversacionPrivada.upsert({where:{idUsuarioA_idUsuarioB:{idUsuarioA:a,idUsuarioB:b}},create:{idUsuarioA:a,idUsuarioB:b},update:{}});
 const {sendMessage}=await import('../src/services/messagesService.js');
 const privateMessage=(await sendMessage(ana.id,{idConversacion:conv.id,contenido:'Privado aislado'})).mensaje;
 for(const [kind,m,destination] of [['canal',channelMessage,ch.id],['conversacion',privateMessage,conv.id]]){
  const react=await interactMessage(ana.id,{accion:'reaccionar',idMensaje:m.id,emoji:'👍'},kind,restrictedPath);
  assert.deepEqual(react.mensaje.reacciones,[{emoji:'👍',usuarios:[ana.id]}]);
  const pin=await interactMessage(ana.id,{accion:'fijar',idMensaje:m.id,fijado:true},kind,restrictedPath);assert(pin.mensaje.fechaFijado);
  const list=await interactMessage(ana.id,{accion:'fijados',idDestino:destination},kind,restrictedPath);assert(list.items.some(row=>row.id===m.id));
  const remove=await interactMessage(ana.id,{accion:'reaccionar',idMensaje:m.id,emoji:null},kind,restrictedPath);assert.deepEqual(remove.mensaje.reacciones,[]);
  const unpin=await interactMessage(ana.id,{accion:'fijar',idMensaje:m.id,fijado:false},kind,restrictedPath);assert.equal(unpin.mensaje.fechaFijado,null);
 }
});

test('encuestas: voto único reemplazable, cierre autorizado y permisos de canal',async()=>{
 const c=await community();await member(c,dani);const ch=await create(c);const {sendChannelMessage}=await import('../src/services/channelMessagesService.js');const {votePoll,closePoll}=await import('../src/services/socialFeaturesService.js');
 const m=(await sendChannelMessage(ana.id,{idCanal:ch.id,contenido:'¿Cuándo?',encuesta:{opciones:['Hoy','Mañana'],multiple:false}})).mensaje;assert.equal(m.encuesta.opciones.length,2);await votePoll(dani.id,m.id,[0]);let r=await votePoll(dani.id,m.id,[1]);assert.deepEqual(r.mensaje.encuesta.votos,[{idUsuario:dani.id,opcion:1}]);await assert.rejects(votePoll(dani.id,m.id,[0,1]),e=>e.code==='INVALID_VOTE');await assert.rejects(closePoll(dani.id,m.id),e=>e.code==='NO_PERMISSION');await closePoll(ana.id,m.id);await assert.rejects(votePoll(dani.id,m.id,[0]),e=>e.code==='POLL_CLOSED');await assert.rejects(votePoll(eli.id,m.id,[0]));
});
test('hilos pausados conservan datos existentes y rechazan nuevas respuestas',async()=>{
 const c=await community();await member(c,dani);const ch=await create(c);const {sendChannelMessage}=await import('../src/services/channelMessagesService.js');const root=(await sendChannelMessage(ana.id,{idCanal:ch.id,contenido:'Tema'})).mensaje;const old=await prisma.mensaje.create({data:{idCanal:ch.id,idAutor:dani.id,idHilo:root.id,contenido:'Respuesta previa'}});await assert.rejects(sendChannelMessage(dani.id,{idCanal:ch.id,idHilo:root.id,contenido:'Nuevo'}),e=>e.code==='THREADS_DISABLED');assert.equal((await request(`/features/threads/${root.id}`,{as:ana})).status,410);assert(await prisma.mensaje.findUnique({where:{id:old.id}}));
});
test('búsqueda filtra autor, tipo y fechas sin revelar canales ajenos',async()=>{
 const c=await community(),ch=await create(c);const {sendChannelMessage}=await import('../src/services/channelMessagesService.js');const {searchMessages}=await import('../src/services/messageSearchService.js');const m=(await sendChannelMessage(ana.id,{idCanal:ch.id,contenido:'Un resultado buscable'})).mensaje;const result=await searchMessages('channel',ch.id,ana.id,{q:'resultado',autor:ana.nombreUsuario,tipo:'texto',desde:'2026-01-01',hasta:'2030-12-31',limit:5});assert.equal(result.items[0].id,m.id);assert.equal((await searchMessages('channel',ch.id,ana.id,{tipo:'video'})).items.length,0);await assert.rejects(searchMessages('channel',ch.id,eli.id,{q:'resultado'}));
});
test('bloquear elimina amistad, oculta personas y desbloquear exige nueva amistad',async()=>{
 const a=Math.min(ana.id,dani.id),b=Math.max(ana.id,dani.id);await prisma.amistad.upsert({where:{idUsuarioA_idUsuarioB:{idUsuarioA:a,idUsuarioB:b}},create:{idUsuarioA:a,idUsuarioB:b},update:{}});const conv=await prisma.conversacionPrivada.upsert({where:{idUsuarioA_idUsuarioB:{idUsuarioA:a,idUsuarioB:b}},create:{idUsuarioA:a,idUsuarioB:b},update:{}});const r=await request(`/features/people/${dani.id}/block`,{method:'PUT',as:ana,body:{bloqueado:true}});assert.equal(r.status,200);const {sendMessage}=await import('../src/services/messagesService.js');await assert.rejects(sendMessage(dani.id,{idConversacion:conv.id,contenido:'No'}),e=>e.code==='NOT_FRIENDS');assert.equal(await prisma.amistad.findUnique({where:{idUsuarioA_idUsuarioB:{idUsuarioA:a,idUsuarioB:b}}}),null);const {searchUsers}=await import('../src/services/friendsService.js');assert(!(await searchUsers(ana.id,dani.nombreUsuario,20)).some(x=>x.usuario.id===dani.id));const blockedList=await request('/features/blocked',{as:ana});assert(blockedList.body.items.some(x=>x.usuario.id===dani.id));assert.equal((await request(`/features/people/${dani.id}`,{as:ana})).body.bloqueado,true);await request(`/features/people/${dani.id}/block`,{method:'PUT',as:ana,body:{bloqueado:false}});await assert.rejects(sendMessage(dani.id,{idConversacion:conv.id,contenido:'Todavía no'}),e=>e.code==='NOT_FRIENDS');const {sendRequest,acceptRequest}=await import('../src/services/friendsService.js');const requestFriend=await sendRequest(ana.id,dani.id);await acceptRequest(requestFriend.id,dani.id);assert((await sendMessage(dani.id,{idConversacion:conv.id,contenido:'Ahora sí'})).mensaje.id);
});
test('everyone exige gestión y notifica solo integrantes con acceso; silencio temporal se respeta',async()=>{
 const c=await community();await member(c,dani);await member(c,eli);const ch=await create(c);const {sendChannelMessage}=await import('../src/services/channelMessagesService.js');const {listNotifications}=await import('../src/services/notificationsService.js');await assert.rejects(sendChannelMessage(dani.id,{idCanal:ch.id,contenido:'@everyone hola'}),e=>e.code==='NO_MENTION_PERMISSION');await sendChannelMessage(ana.id,{idCanal:ch.id,contenido:'@everyone Aviso'});await drainEffects();assert((await listNotifications(dani.id)).items.some(n=>n.distincion==='mencion'));await request(`/chat-state/comunidad/${c.id}`,{method:'PATCH',as:dani,body:{silencio:'60'}});const before=await prisma.notificacion.count({where:{idUsuario:dani.id}});await sendChannelMessage(ana.id,{idCanal:ch.id,contenido:'@everyone Otro aviso'});await drainEffects();assert.equal(await prisma.notificacion.count({where:{idUsuario:dani.id}}),before);await request(`/chat-state/comunidad/${c.id}`,{method:'PATCH',as:dani,body:{silencio:'0'}});
});
test('personalización y tema persisten sin publicar preferencias privadas',async()=>{
 const r=await request('/users/me',{method:'PATCH',as:ana,body:{tituloPerfil:'Desarrollo web',pronombres:'él',colorPerfil:'#123456'}});assert.equal(r.status,200);const prefs=await request('/users/me/preferences',{method:'PATCH',as:ana,body:{tema:'oscuro'}});assert.equal(prefs.status,200);assert.equal(prefs.body.usuario.preferencias.tema,'oscuro');const pub=await request(`/users/${ana.id}`,{as:dani});assert.equal(pub.body.usuario.tituloPerfil,'Desarrollo web');assert.equal(pub.body.usuario.preferencias,undefined);assert.equal(pub.body.usuario.correo,undefined);
});
test('reportes y registro solo son consultables por administración',async()=>{
 const c=await community();await member(c,dani);const r=await request(`/features/people/${ana.id}/reports`,{method:'POST',as:dani,body:{motivo:'Contenido para revisar',idComunidad:c.id}});assert.equal(r.status,201);assert.equal((await request(`/features/communities/${c.id}/reports`,{as:eli})).status,403);const reports=await request(`/features/communities/${c.id}/reports`,{as:ana});assert.equal(reports.body.items[0].id,r.body.reporte.id);await request(`/features/reports/${r.body.reporte.id}`,{method:'PATCH',as:ana,body:{estado:'RESUELTO'}});assert.equal((await request(`/features/communities/${c.id}/audit`,{as:dani})).status,403);assert.equal((await request(`/features/communities/${c.id}/audit`,{as:ana})).body.items.length,1);
});
test('audios autenticados conservan MIME y lectura solo afecta mensajes del otro participante',async()=>{
 const a=Math.min(ana.id,dani.id),b=Math.max(ana.id,dani.id);await prisma.amistad.upsert({where:{idUsuarioA_idUsuarioB:{idUsuarioA:a,idUsuarioB:b}},create:{idUsuarioA:a,idUsuarioB:b},update:{}});const conv=await prisma.conversacionPrivada.upsert({where:{idUsuarioA_idUsuarioB:{idUsuarioA:a,idUsuarioB:b}},create:{idUsuarioA:a,idUsuarioB:b},update:{}});const form=new FormData();form.append('tipo','conversacion');form.append('id',String(conv.id));form.append('archivo',new Blob([Buffer.from([26,69,223,163,0,1])],{type:'audio/webm'}),'audio.webm');const r=await fetch(`${baseUrl}/api/files/batch`,{method:'POST',headers:{Cookie:ana.cookie},body:form});assert.equal(r.status,201);const m=(await r.json()).mensajes[0];assert.equal(m.adjunto.tipo,'audio/webm');assert.equal((await request(`/features/receipts/${conv.id}`,{method:'POST',as:eli,body:{estado:'leido'}})).status,403);await request(`/features/receipts/${conv.id}`,{method:'POST',as:dani,body:{estado:'leido'}});const saved=await prisma.mensaje.findUnique({where:{id:m.id}});assert(saved.fechaEntrega);assert(saved.fechaLectura);
});
test('menciones y respuestas privadas distinguen sus avisos; bloquear se mantiene al recargar',async()=>{
 const a=Math.min(ana.id,dani.id),b=Math.max(ana.id,dani.id);await prisma.amistad.upsert({where:{idUsuarioA_idUsuarioB:{idUsuarioA:a,idUsuarioB:b}},create:{idUsuarioA:a,idUsuarioB:b},update:{}});const conv=await prisma.conversacionPrivada.upsert({where:{idUsuarioA_idUsuarioB:{idUsuarioA:a,idUsuarioB:b}},create:{idUsuarioA:a,idUsuarioB:b},update:{}});const {sendMessage}=await import('../src/services/messagesService.js');const {listNotifications}=await import('../src/services/notificationsService.js');const {getFriendIds}=await import('../src/services/friendsService.js');const root=(await sendMessage(dani.id,{idConversacion:conv.id,contenido:'Consulta inicial'})).mensaje;await sendMessage(ana.id,{idConversacion:conv.id,idRespuesta:root.id,contenido:'Respuesta'});await sendMessage(ana.id,{idConversacion:conv.id,contenido:`@${dani.nombreUsuario} aviso`});await drainEffects();const notices=(await listNotifications(dani.id)).items;assert(notices.some(n=>n.distincion==='respuesta'));assert(notices.some(n=>n.distincion==='mencion'));await request(`/features/people/${dani.id}/block`,{method:'PUT',as:ana,body:{bloqueado:true}});assert(!(await getFriendIds(ana.id)).includes(dani.id));assert(!(await getFriendIds(dani.id)).includes(ana.id));await request(`/features/people/${dani.id}/block`,{method:'PUT',as:ana,body:{bloqueado:false}});assert(!(await getFriendIds(ana.id)).includes(dani.id));
});
test('mencionar a todos desde el texto de un archivo también exige permiso',async()=>{
 const c=await community();await member(c,dani);const ch=await create(c);const form=new FormData();form.append('tipo','canal');form.append('id',String(ch.id));form.append('texto','@everyone archivo');form.append('archivo',new Blob(['%PDF-1.4 prueba'],{type:'application/pdf'}),'prueba.pdf');const response=await fetch(`${baseUrl}/api/files/batch`,{method:'POST',headers:{Cookie:dani.cookie},body:form});assert.equal(response.status,403);assert.equal((await response.json()).error.code,'NO_MENTION_PERMISSION');assert.equal(await prisma.mensaje.count({where:{idCanal:ch.id}}),0);
});
test('bloquear rechaza solicitudes pendientes y el registro de bloqueados es privado',async()=>{
 const {sendRequest,acceptRequest,searchUsers}=await import('../src/services/friendsService.js');const pending=await sendRequest(ana.id,eli.id);assert.equal((await request(`/features/people/${eli.id}/block`,{method:'PUT',as:ana,body:{bloqueado:true}})).status,200);assert.equal((await prisma.solicitudAmistad.findUnique({where:{id:pending.id}})).estado,'RECHAZADA');await assert.rejects(acceptRequest(pending.id,eli.id));assert(!(await searchUsers(eli.id,ana.nombreUsuario,20)).some(r=>r.usuario.id===ana.id));const own=await request('/features/blocked',{as:ana}),other=await request('/features/blocked',{as:eli});assert(own.body.items.some(r=>r.usuario.id===eli.id));assert(!other.body.items.some(r=>r.usuario.id===ana.id));assert.equal(own.body.items[0].usuario.correo,undefined);await request(`/features/people/${eli.id}/block`,{method:'PUT',as:ana,body:{bloqueado:false}});
});
test('reportar exige una comunidad compartida y nunca admite reportes generales',async()=>{
 assert.equal((await request(`/features/people/${dani.id}/reports`,{method:'POST',as:ana,body:{motivo:'Prueba sin comunidad'}})).status,400);const c=await community();assert.equal((await request(`/features/people/${dani.id}/reports`,{method:'POST',as:ana,body:{motivo:'Comunidad no compartida',idComunidad:c.id}})).status,403);
});
test('portadas usan moderación y almacenamiento de imágenes, DTO público y borrado propio',async()=>{
 const {v2:cloudinary}=await import('cloudinary');const {Writable}=await import('node:stream');const original=cloudinary.uploader.upload_stream;let options;
 cloudinary.uploader.upload_stream=(o,callback)=>{options=o;return new Writable({write(chunk,enc,next){next();},final(next){callback(null,{secure_url:'https://example.test/cover.webp'});next();}});};
 try{const form=new FormData();form.append('portada',new Blob([Buffer.from([137,80,78,71,13,10,26,10])],{type:'image/png'}),'cover.png');const r=await fetch(`${baseUrl}/api/users/me/portada`,{method:'POST',headers:{Cookie:ana.cookie},body:form});assert.equal(r.status,200);assert.equal((await r.json()).usuario.portadaUrl,'https://example.test/cover.webp');assert.equal(options.transformation[0].width,1200);const pub=await request(`/users/${ana.id}`,{as:dani});assert.equal(pub.body.usuario.portadaUrl,'https://example.test/cover.webp');assert(pub.body.usuario.fechaCreacion);assert.equal(pub.body.usuario.correo,undefined);assert.equal((await request('/users/me/portada',{method:'DELETE',as:ana})).status,200);assert.equal((await prisma.usuario.findUnique({where:{id:ana.id}})).portadaUrl,null);
 }finally{cloudinary.uploader.upload_stream=original;}
});
test('la migración aplica la eliminación de amistad a bloqueos previos sin borrar historial',async()=>{
 const legacy='test_refine_migration_'+randomUUID().replaceAll('-',''),dbUrl=new URL(databaseUrl);dbUrl.searchParams.set('schema',legacy);const db=new PrismaClient({datasourceUrl:dbUrl.href});
 try{await admin.$executeRawUnsafe(`CREATE SCHEMA "${legacy}"`);await applyMigrations(admin,legacy,{hasta:'20261122050000_colaboracion_integral'});const a=await db.usuario.create({select:{id:true},data:{nombreUsuario:'primero',nombreVisible:'Primero',correo:'primero@test.test',hashContrasena:'test'}}),b=await db.usuario.create({select:{id:true},data:{nombreUsuario:'segundo',nombreVisible:'Segundo',correo:'segundo@test.test',hashContrasena:'test'}});await db.amistad.create({data:{idUsuarioA:a.id,idUsuarioB:b.id}});const conv=await db.conversacionPrivada.create({data:{idUsuarioA:a.id,idUsuarioB:b.id}});const message=await db.mensaje.create({data:{idConversacion:conv.id,idAutor:a.id,contenido:'Conservar este historial'}});const pending=await db.solicitudAmistad.create({data:{idEmisor:a.id,idReceptor:b.id}});await db.bloqueoUsuario.create({data:{idActor:b.id,idObjetivo:a.id}});await applyMigrations(admin,legacy,{desde:'20261122050000_colaboracion_integral'});assert.equal(await db.amistad.count(),0);assert.equal((await db.solicitudAmistad.findUnique({where:{id:pending.id}})).estado,'RECHAZADA');assert.equal((await db.mensaje.findUnique({where:{id:message.id}})).contenido,'Conservar este historial');assert.equal((await db.usuario.findUnique({where:{id:a.id}})).portadaUrl,null);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${legacy}" CASCADE`);}
});
test('buscar por día respeta el desfase horario del usuario y excluye respuestas de hilos',async()=>{
 const c=await community(),ch=await create(c);const previous=await prisma.mensaje.create({data:{idCanal:ch.id,idAutor:ana.id,contenido:'Antes de medianoche',fechaCreacion:new Date('2026-11-22T02:30:00Z')}});const current=await prisma.mensaje.create({data:{idCanal:ch.id,idAutor:ana.id,contenido:'Después de medianoche',fechaCreacion:new Date('2026-11-22T03:30:00Z')}});await prisma.mensaje.create({data:{idCanal:ch.id,idAutor:ana.id,idHilo:current.id,contenido:'Respuesta histórica',fechaCreacion:new Date('2026-11-22T04:00:00Z')}});const r=await request(`/channels/${ch.id}/messages/search?desde=2026-11-22&hasta=2026-11-22&desfase=180`,{as:ana});assert.equal(r.status,200);assert.deepEqual(r.body.items.map(m=>m.id),[current.id]);assert(!r.body.items.some(m=>m.id===previous.id));
});
test('bloquear cierra llamadas activas y evita nuevos inicios de llamadas privadas',async()=>{
 const {media}=await import('../src/services/mediaService.js'),{startPrivateCall}=await import('../src/services/privateCallsService.js');const original=media.configurado,close=media.cerrarPrivada;media.configurado=true;media.cerrarPrivada=async()=>{};
 try{const a=Math.min(ana.id,eli.id),b=Math.max(ana.id,eli.id);await prisma.amistad.upsert({where:{idUsuarioA_idUsuarioB:{idUsuarioA:a,idUsuarioB:b}},create:{idUsuarioA:a,idUsuarioB:b},update:{}});const conv=await prisma.conversacionPrivada.upsert({where:{idUsuarioA_idUsuarioB:{idUsuarioA:a,idUsuarioB:b}},create:{idUsuarioA:a,idUsuarioB:b},update:{}});const call=await prisma.llamadaPrivada.create({data:{id:randomUUID(),idConversacion:conv.id,idEmisor:ana.id,idReceptor:eli.id,estado:'ACEPTADA'}});assert.equal((await request(`/features/people/${eli.id}/block`,{method:'PUT',as:ana,body:{bloqueado:true}})).status,200);assert.equal((await prisma.llamadaPrivada.findUnique({where:{id:call.id}})).estado,'FINALIZADA');await assert.rejects(startPrivateCall(ana,null,{idConversacion:conv.id,video:false}),e=>e.code==='NOT_FRIENDS');await request(`/features/people/${eli.id}/block`,{method:'PUT',as:ana,body:{bloqueado:false}});
 }finally{media.configurado=original;media.cerrarPrivada=close;}
});
