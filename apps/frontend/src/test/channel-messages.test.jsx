import { beforeEach, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useChannelMessages } from '../hooks/useChannelMessages.js';
import { useSocket } from '../hooks/useSocket.js';
import { getChannel, getChannelMessages } from '../services/channelsService.js';
import { getCommunityMembers } from '../services/communitiesService.js';
vi.mock('../hooks/useSocket.js', () => ({ useSocket: vi.fn() }));
vi.mock('../services/channelsService.js', () => ({ getChannel: vi.fn(), getChannelMessages: vi.fn() }));
vi.mock('../services/communitiesService.js', () => ({ getCommunityMembers: vi.fn() }));
const canal = (id = 1) => ({ id, idComunidad: 4, nombre: 'general', tipo: 'TEXTO', misPermisos: ['VER', 'ESCRIBIR'] });
const message = (id, extra = {}) => ({ id, idCanal: 1, autor: { id: 7, nombreVisible: 'Feli', nombreUsuario: 'feli' }, fechaCreacion: `2026-10-20T10:00:${String(id).padStart(2, '0')}Z`, contenido: `Mensaje ${id}`, eliminado: false, ...extra });
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a;reject=b; }); return { promise, resolve, reject }; };
const failure = (status, code) => Object.assign(new Error(code), { status, code });
let socket, listeners, emitAck;
const fire = (name, data) => act(() => { [...(listeners.get(name) ?? [])].forEach((fn) => fn(data)); });
const show = () => renderHook(({ id }) => useChannelMessages(id, 4), { initialProps: { id: 1 } });
const ready = (result) => waitFor(() => expect(result.current.ready).toBe(true));
beforeEach(() => {
  vi.clearAllMocks(); listeners = new Map();
  emitAck = vi.fn((event, payload, cb) => cb(null, { ok: true, data: event === 'channel:subscribe' ? { canal: canal(payload.idCanal) } : event === 'channel:unsubscribe' ? {} : { mensaje: message(3) } }));
  socket = { connected: true, on: (n, fn) => { if (!listeners.has(n)) listeners.set(n, new Set()); listeners.get(n).add(fn); }, off: (n, fn) => listeners.get(n)?.delete(fn), timeout: () => ({ emit: (...args) => emitAck(...args) }) };
  useSocket.mockReturnValue(socket);
  getChannel.mockResolvedValue({ canal: canal() });
  getChannelMessages.mockResolvedValue({ items: [message(2), message(1)], nextCursor: null });
  getCommunityMembers.mockResolvedValue({ items: [{ usuario: message(1).autor, rol: 'INTEGRANTE' }] });
});
it('suscribe antes de consultar HTTP, ordena y deduplica HTTP, ack y evento', async () => {
  const { result } = show(); await ready(result);
  expect(emitAck.mock.invocationCallOrder[0]).toBeLessThan(getChannelMessages.mock.invocationCallOrder[0]);
  fire('channel-message:new', { mensaje: message(3) });
  await act(async () => result.current.action('channel-message:send', { idCanal: 1, contenido: 'Hola' }));
  expect(result.current.messages.map((m) => m.id)).toEqual([1,2,3]);
});
it('ignora eventos de otros canales', async () => {
  const { result } = show(); await ready(result); fire('channel-message:new', { mensaje: message(4, { idCanal: 8 }) });
  expect(result.current.messages).toHaveLength(2);
});
it('la eliminación recibida durante HTTP pendiente nunca restaura contenido', async () => {
  const pending = deferred();getChannelMessages.mockReturnValueOnce(pending.promise);const { result } = show();
  await waitFor(() => expect(getChannelMessages).toHaveBeenCalled());
  fire('channel-message:deleted', { idCanal: 1, idMensaje: 1, eliminadoPorModerador: true });
  await act(async () => pending.resolve({ items: [message(1)], nextCursor: null }));await ready(result);
  expect(result.current.messages[0]).toMatchObject({ eliminado: true, contenido: null, eliminadoPorModerador: true, autor: message(1).autor });
});
it('la edición recibida durante HTTP conserva su versión más nueva', async () => {
  const pending = deferred(); getChannelMessages.mockReturnValueOnce(pending.promise); const { result } = show();
  await waitFor(() => expect(getChannelMessages).toHaveBeenCalled());
  fire('channel-message:updated', { mensaje: message(1, { contenido: 'Nuevo', fechaEdicion: '2026-10-20T11:00:00Z' }) });
  await act(async () => pending.resolve({ items: [message(1)], nextCursor: null }));await ready(result);
  expect(result.current.messages[0].contenido).toBe('Nuevo');
});
it('un ack de edición demorado no pisa un evento de edición posterior', async () => {
  const { result } = show(); await ready(result); let reply;
  emitAck.mockImplementationOnce((_e,_p,cb) => { reply = cb; });
  const pending = result.current.action('channel-message:edit', { idMensaje: 1, contenido: 'Primero' });
  fire('channel-message:updated', { mensaje: message(1, { contenido: 'Segundo', fechaEdicion: '2026-10-20T12:00:00Z' }) });
  await act(async () => reply(null,{ ok: true, data: { mensaje: message(1, { contenido: 'Primero', fechaEdicion: '2026-10-20T11:00:00Z' }) } }));await pending;
  expect(result.current.messages[0].contenido).toBe('Segundo');
});
it('cargar anteriores respeta ediciones y elimina duplicados', async () => {
  getChannelMessages.mockResolvedValueOnce({ items: [message(2)], nextCursor: 2 });
  const { result } = show(); await ready(result);
  getChannelMessages.mockResolvedValueOnce({ items: [message(1),message(2)], nextCursor: null });
  fire('channel-message:updated', { mensaje: message(2, { contenido: 'Editado', fechaEdicion: '2026-10-20T11:00:00Z' }) });
  await act(async () => result.current.older());
  expect(result.current.messages.map(m=>m.id)).toEqual([1,2]);expect(result.current.messages[1].contenido).toBe('Editado');expect(result.current.cursor).toBeNull();
});
it('bloquea cargas anteriores concurrentes y permite reintentar fallos de red', async () => {
  getChannelMessages.mockResolvedValueOnce({ items: [message(2)], nextCursor: 2 });
  const { result } = show();await ready(result);const pending=deferred();getChannelMessages.mockReturnValueOnce(pending.promise);
  let operation; act(()=>{ operation=result.current.older();result.current.older(); });expect(getChannelMessages).toHaveBeenCalledTimes(2);
  await act(async()=>{ pending.reject(failure(0,'NETWORK_ERROR'));await operation; });
  expect(result.current.cursor).toBe(2);expect(result.current.messages).toHaveLength(1);expect(result.current.error).toBe('NETWORK_ERROR');
});
it.each(['channel:access-lost','channel:deleted'])('%s invalida HTTP en vuelo y limpia inmediatamente',async(event)=>{
  const {result}=show();await ready(result);const pending=deferred();getChannelMessages.mockReturnValueOnce(pending.promise);
  let load;act(()=>{load=result.current.reload();});await waitFor(()=>expect(getChannelMessages).toHaveBeenCalledTimes(2));
  fire(event,{idCanal:1,idComunidad:4});expect(result.current.lost).toBe(true);expect(result.current.messages).toEqual([]);
  await act(async()=>{pending.resolve({items:[message(1)],nextCursor:null});await load;});expect(result.current.messages).toEqual([]);
  fire('channel-message:new',{mensaje:message(8)});expect(result.current.messages).toEqual([]);
});
it('cambiar rápidamente de canal descarta respuestas y acks antiguos', async()=>{
  const pending=deferred();getChannelMessages.mockReturnValueOnce(pending.promise);const{result,rerender}=show();
  await waitFor(()=>expect(getChannelMessages).toHaveBeenCalled());
  getChannelMessages.mockResolvedValueOnce({items:[message(4,{idCanal:2})],nextCursor:null});rerender({id:2});await ready(result);
  await act(async()=>pending.resolve({items:[message(1)],nextCursor:null}));expect(result.current.messages.map(m=>m.idCanal)).toEqual([2]);
});
it('reconectar revalida permisos y reemplaza la ventana completa, incluyendo cambios de páginas anteriores',async()=>{
  getChannelMessages.mockResolvedValueOnce({items:[message(2)],nextCursor:2});const{result}=show();await ready(result);
  getChannelMessages.mockResolvedValueOnce({items:[message(1)],nextCursor:null});await act(async()=>result.current.older());
  socket.connected=false;fire('disconnect');expect(result.current.messages).toEqual([]);expect(result.current.connected).toBe(false);
  getChannelMessages.mockResolvedValueOnce({items:[message(2,{eliminado:true,contenido:null})],nextCursor:2});socket.connected=true;fire('connect');await ready(result);
  expect(result.current.messages.map(m=>m.id)).toEqual([2]);expect(result.current.messages[0].eliminado).toBe(true);expect(result.current.cursor).toBe(2);
});
it('un cambio de permisos a solo lectura actualiza el snapshot de suscripción',async()=>{
  const{result}=show();await ready(result);
  emitAck.mockImplementationOnce((_e,_p,cb)=>cb(null,{ok:true,data:{canal:{...canal(),misPermisos:['VER']}}}));
  fire('channel:updated',{canal:{...canal(),misPermisos:['VER']}});await ready(result);expect(result.current.canal.misPermisos).toEqual(['VER']);
});
it('un canal que cambia de tipo retira el chat',async()=>{
  const{result}=show();await ready(result);fire('channel:updated',{canal:{...canal(),tipo:'VOZ'}});expect(result.current.lost).toBe(true);expect(result.current.messages).toEqual([]);
});
it.each(['community:left','community:deleted'])('%s limpia la comunidad actual e ignora otras',async(event)=>{
  const{result}=show();await ready(result);fire(event,{idComunidad:99});expect(result.current.messages).toHaveLength(2);
  fire(event,{idComunidad:4});expect(result.current.lost).toBe(true);expect(result.current.messages).toEqual([]);
});
it('HTTP 403 al paginar elimina también la historia previamente cargada',async()=>{
  getChannelMessages.mockResolvedValueOnce({items:[message(2)],nextCursor:2});const{result}=show();await ready(result);
  getChannelMessages.mockRejectedValueOnce(failure(403,'CHANNEL_NOT_FOUND'));await act(async()=>result.current.older());expect(result.current.lost).toBe(true);expect(result.current.messages).toEqual([]);
});
it('timeout de envío recupera historial antes de permitir otra operación',async()=>{
  const{result}=show();await ready(result);const pending=deferred();getChannelMessages.mockReturnValueOnce(pending.promise);
  emitAck.mockImplementationOnce((_e,_p,cb)=>cb(new Error('timeout')));
  let operation;act(()=>{operation=result.current.action('channel-message:send',{idCanal:1,contenido:'Hola'}).catch(e=>e);});
  await waitFor(()=>expect(result.current.ready).toBe(false));
  await act(async()=>pending.resolve({items:[message(1),message(3)],nextCursor:null}));expect((await operation).code).toBe('ACK_TIMEOUT');await ready(result);expect(result.current.messages.map(m=>m.id)).toEqual([1,3]);
});
it('una sesión rechazada retira los datos',async()=>{
  const{result}=show();await ready(result);emitAck.mockImplementationOnce((_e,_p,cb)=>cb(null,{ok:false,error:{code:'UNAUTHORIZED',message:'Sesión finalizada'}}));
  await act(async()=>{await expect(result.current.action('channel-message:send',{idCanal:1,contenido:'Hola'})).rejects.toMatchObject({code:'UNAUTHORIZED'});});expect(result.current.lost).toBe(true);expect(result.current.messages).toEqual([]);
});
it('perfil actualizado refresca la identidad y la membresía usadas por los controles',async()=>{
  const{result}=show();await ready(result);getCommunityMembers.mockResolvedValueOnce({items:[{usuario:{...message(1).autor,nombreVisible:'Felipe'},rol:'MODERADOR'}]});
  fire('user:updated',{usuario:{id:7}});await waitFor(()=>expect(result.current.members[0]?.usuario.nombreVisible).toBe('Felipe'));
});
it('si falla el directorio conserva lectura y deshabilita moderación',async()=>{
  getCommunityMembers.mockRejectedValueOnce(failure(0,'NETWORK_ERROR'));const{result}=show();await ready(result);
  expect(result.current.messages).toHaveLength(2);expect(result.current.membersReady).toBe(false);expect(result.current.memberError).toContain('moderación está deshabilitada');
});
it('sin socket consulta por HTTP pero no habilita acciones en tiempo real',async()=>{
  useSocket.mockReturnValue(null);const{result}=show();await ready(result);expect(getChannel).toHaveBeenCalledWith(1);expect(result.current.connected).toBe(false);
});
it('eliminar por ack oculta contenido aunque no llegue el evento',async()=>{
  const{result}=show();await ready(result);emitAck.mockImplementationOnce((_e,_p,cb)=>cb(null,{ok:true,data:{idMensaje:1,idCanal:1,eliminadoPorModerador:true}}));
  await act(async()=>result.current.action('channel-message:delete',{idMensaje:1}));expect(result.current.messages[0]).toMatchObject({eliminado:true,contenido:null,eliminadoPorModerador:true});
});
it('limpia listeners y serializa subscribe/unsubscribe al volver A → B → A',async()=>{
  let reply;emitAck.mockImplementationOnce((_e,_p,cb)=>{reply=cb;});const first=show();await waitFor(()=>expect(reply).toBeDefined());first.unmount();
  expect([...listeners.values()].every(set=>!set.size)).toBe(true);
  const second=show();await act(async()=>reply(null,{ok:true,data:{canal:canal()}}));await ready(second.result);
  expect(emitAck.mock.calls.filter(([e])=>e.startsWith('channel:')).map(([e])=>e)).toEqual(['channel:subscribe','channel:unsubscribe','channel:subscribe']);
});
it('una operación del canal anterior no incorpora su ack a la selección nueva',async()=>{
 const{result,rerender}=show();await ready(result);let reply;
 emitAck.mockImplementationOnce((_e,_p,cb)=>{reply=cb;});const operation=result.current.action('channel-message:send',{idCanal:1,contenido:'Pendiente'}).catch(e=>e);
 getChannelMessages.mockResolvedValueOnce({items:[message(5,{idCanal:2})],nextCursor:null});rerender({id:2});await ready(result);
 await act(async()=>reply(null,{ok:true,data:{mensaje:message(3)}}));expect((await operation).code).toBe('STALE_CHANNEL');expect(result.current.messages.map(m=>m.idCanal)).toEqual([2]);
});
it('un subscribe tardío anterior a una revocación no abre el historial',async()=>{
 let reply;emitAck.mockImplementationOnce((_e,_p,cb)=>{reply=cb;});const{result}=show();await waitFor(()=>expect(reply).toBeDefined());
 fire('channel:access-lost',{idCanal:1,idComunidad:4});await act(async()=>reply(null,{ok:true,data:{canal:canal()}}));
 expect(getChannelMessages).not.toHaveBeenCalled();expect(result.current.lost).toBe(true);expect(result.current.messages).toEqual([]);
});
