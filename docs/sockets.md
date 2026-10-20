# Contrato de eventos socket — Dialo

Eventos de comunidades y canales (Entrega 50%): ver [comunidades.md](./comunidades.md#eventos-de-socket).

Contrato implementado hasta T-27, complementario a [api.md](api.md) y [comunidades.md](comunidades.md). Las garantías pendientes de T-15 se distinguen de las ya implementadas.

---

## Convenciones globales

- Nombres con el formato `recurso:acción`, en minúsculas: `message:new`, `friend:accepted`.
- Los nombres viven en **un solo lugar por app** y se copian igual en los dos:
  - back: `apps/backend/src/sockets/events.js`
  - front: `apps/frontend/src/constants/events.js`
- Mismas formas que la API: `UsuarioPublico`, `Mensaje`, `Conversacion`, etc. (ver [api.md](./api.md#formas-compartidas)).
- El socket nunca es la fuente de verdad: la base lo es. Si el front se pierde un evento, lo recupera pidiendo por HTTP.

### Conexión

1. El front abre **una sola** conexión después del login (`SocketContext`) y la cierra en el logout. El cliente usa `VITE_SOCKET_URL` (vacío: origen actual) y `withCredentials: true`. En desarrollo Vite redirige `/socket.io`; en un despliegue con API separada se configura su origen y CORS.
2. La cookie `dialo_sid` viaja en el handshake. `authenticateSocket` reutiliza `findAuthUserBySessionToken`, igual que la autenticación HTTP, y guarda en `socket.data.user` la misma forma que `req.user`.
3. Sin sesión válida, la conexión se rechaza con el error `UNAUTHORIZED`. `ConversationsProvider` recibe `connect_error` y vuelve a consultar la identidad por HTTP. El manejo diferenciado de errores de red/servidor sigue pendiente en T-15.
   - **Solo en desarrollo** (`NODE_ENV` distinto de `production`): si el handshake trae `auth: { devUserId }`, el middleware usa ese usuario sin pedir cookie. Es el equivalente del header HTTP `x-dev-user-id` de `authenticate`. El frontend lo habilita en desarrollo mediante `VITE_DEV_USER_ID`; dejarlo vacío para probar sesiones reales.
4. Al conectarse, el servidor une el socket a:
   - `user:<id>` — su room personal.
   - `conversation:<id>` — una por cada conversación del usuario.
   - `community:<id>` — una por cada membresía vigente.
   - No se une automáticamente a `channel:<id>`; requiere `channel:subscribe` con Ver.
5. Antes de cada operación de mensajes se vuelve a comprobar la sesión en la base. Si fue revocada o venció, se responde ack `UNAUTHORIZED` y se desconecta ese socket, retirándolo de sus rooms. En canales también se revalida cada sesión receptora antes de entregar mensajes. No hay vencimiento programado ni desconexión proactiva global de sesiones inactivas: queda pendiente T-15. En particular, la emisión privada a rooms todavía no revalida las sesiones receptoras. En desarrollo también se vuelve a comprobar la existencia del usuario de prueba.
6. El primer evento puede enviarse al conectar: sus handlers esperan la inicialización de rooms antes de procesarlo. Las reconexiones recuperan las rooms de conversaciones existentes, incluso si ya no hay amistad.

### Rooms

| Room | Quién está | Para qué |
| --- | --- | --- |
| `user:<id>` | todas las pestañas abiertas de ese usuario | avisos personales: amistades, perfil de amigos, conversaciones nuevas |
| `conversation:<id>` | los sockets de los dos participantes | mensajes nuevos, editados y eliminados |
| `community:<id>` | sockets de integrantes | cambios de comunidad, ingresos y abandonos |
| `channel:<id>` | sockets que se suscribieron con Ver | mensajes de ese canal; cada entrega revalida sesión y Ver |

### Ack (respuesta a eventos del cliente)

Todo evento **cliente → servidor** recibe un callback de confirmación con una de estas formas:

```json
{ "ok": true, "data": {} }
```

```json
{ "ok": false, "error": { "code": "NOT_AUTHOR", "message": "Solo el autor puede editar el mensaje" } }
```

`error` tiene la misma forma que en la API (incluido `details` en `VALIDATION_ERROR`).

Todos los eventos de mensajes pueden devolver `UNAUTHORIZED`. Ante fallas internas se devuelve `INTERNAL_ERROR` sin datos de la base ni credenciales. Los IDs deben ser números enteros positivos dentro del rango de PostgreSQL (hasta 2147483647); no se aceptan strings numéricos. El autor y el usuario que elimina se obtienen de la sesión: campos adicionales de identidad en el payload no se utilizan.

---

## Resumen de eventos

| Evento | Dirección | Room destino | Lo emite | Lo escucha |
| --- | --- | --- | --- | --- |
| `message:send` | cliente → servidor | — | vista de chat | `conversationsSocket.js` |
| `message:edit` | cliente → servidor | — | vista de chat | `conversationsSocket.js` |
| `message:delete` | cliente → servidor | — | vista de chat | `conversationsSocket.js` |
| `message:new` | servidor → cliente | `conversation:<id>` | `messagesService.js` mediante `emitter.js` | `useMessages`, lista de conversaciones |
| `message:updated` | servidor → cliente | `conversation:<id>` | `messagesService.js` mediante `emitter.js` | `useMessages`, lista de conversaciones |
| `message:deleted` | servidor → cliente | `conversation:<id>` | `messagesService.js` mediante `emitter.js` | `useMessages`, lista de conversaciones |
| `conversation:new` | servidor → cliente | `user:<id>` de los dos | `conversationsService` | lista de conversaciones |
| `friend:request` | servidor → cliente | `user:<id>` de emisor y receptor | `friendsService` | bandeja de solicitudes, solicitudes enviadas, buscador |
| `friend:accepted` | servidor → cliente | `user:<id>` de emisor y receptor | `friendsService` | `useFriends`, bandeja, buscador |
| `friend:rejected` | servidor → cliente | `user:<id>` de emisor y receptor | `friendsService` | bandeja, solicitudes enviadas, buscador |
| `friend:removed` | servidor → cliente | `user:<id>` de los dos | `friendsService` | `useFriends`, lista de conversaciones |
| `user:updated` | servidor → cliente | `user:<id>` de cada amigo y del propio usuario | `usersService` | store de usuarios |

---

## Mensajes

### message:send

Dirección: cliente → servidor

Payload:
```json
{ "idConversacion": 3, "contenido": "Hola!" }
```

El servidor valida, verifica que el usuario participe y que sigan siendo amigos, guarda el mensaje y emite `message:new` a la room.

El contenido se recorta en sus extremos antes de validar: debe tener entre 1 y 2000 caracteres. Los mensajes compuestos solo por espacios se rechazan. El mismo criterio se aplica en `message:edit`.

Ack `ok`:
```json
{ "ok": true, "data": { "mensaje": "Mensaje" } }
```

Errores:
| code | Cuándo |
| --- | --- |
| `VALIDATION_ERROR` | `contenido` vacío o de más de 2000 caracteres |
| `CONVERSATION_NOT_FOUND` | la conversación no existe |
| `NOT_PARTICIPANT` | el usuario no participa |
| `NOT_FRIENDS` | ya no son amigos |

### message:edit

Dirección: cliente → servidor

Payload:
```json
{ "idMensaje": 120, "contenido": "Hola! (corregido)" }
```

Actualiza `contenido` y `fecha_edicion`, y emite `message:updated` a la room.

La edición exige autoría y participación. Puede corregirse un mensaje anterior después de perder la amistad; esa pérdida solo impide nuevos envíos. Un mensaje eliminado no puede editarse ni restaurarse.

Ack `ok`:
```json
{ "ok": true, "data": { "mensaje": "Mensaje" } }
```

Errores:
| code | Cuándo |
| --- | --- |
| `VALIDATION_ERROR` | `contenido` inválido |
| `MESSAGE_NOT_FOUND` | el mensaje no existe |
| `NOT_AUTHOR` | el usuario no es el autor |
| `MESSAGE_DELETED` | el mensaje ya fue eliminado |
| `NOT_PARTICIPANT` | el autor no pertenece a la conversación privada |

### message:delete

Dirección: cliente → servidor

Payload:
```json
{ "idMensaje": 120 }
```

Completa `fecha_eliminacion` e `id_usuario_eliminacion`, y emite `message:deleted` a la room.

Es una eliminación lógica: se conserva la fila y los datos de auditoría. No se devuelve el contenido en el ack ni en el evento; T-10 lo representa con contenido nulo en detalle, listado e historial. La autoría y participación siguen siendo obligatorias, aunque ya no haya amistad. Los mensajes de canales quedan fuera de estas operaciones.

Ack `ok`:
```json
{ "ok": true, "data": { "idMensaje": 120 } }
```

Errores:
| code | Cuándo |
| --- | --- |
| `MESSAGE_NOT_FOUND` | el mensaje no existe |
| `NOT_AUTHOR` | el usuario no es el autor |
| `MESSAGE_DELETED` | ya estaba eliminado |
| `VALIDATION_ERROR` | `idMensaje` ausente o inválido |
| `NOT_PARTICIPANT` | el autor no pertenece a la conversación privada |

### message:new

Dirección: servidor → cliente · Room: `conversation:<idConversacion>`

Payload:
```json
{ "mensaje": "Mensaje" }
```

Lo recibe también el autor, incluso antes del ack. El front combina ack, evento e historial por ID sin depender de su orden. Un mensaje eliminado no recupera contenido al recibir una respuesta anterior.

### message:updated

Dirección: servidor → cliente · Room: `conversation:<idConversacion>`

Payload:
```json
{ "mensaje": "Mensaje" }
```

El front combina el mensaje con ese ID y muestra el estado editado; una actualización no restaura un mensaje ya marcado como eliminado.

### message:deleted

Dirección: servidor → cliente · Room: `conversation:<idConversacion>`

Payload:
```json
{ "idMensaje": 120, "idConversacion": 3 }
```

El front marca el mensaje como eliminado y muestra "Mensaje eliminado".

---

## Conversaciones

### conversation:new

Dirección: servidor → cliente · Room: `user:<id>` de los dos participantes

Payload:
```json
{ "conversacion": "Conversacion" }
```

Antes de emitirlo, el servidor ya unió los sockets de los dos usuarios a `conversation:<id>` (`joinConversation`). El front solo la agrega a su lista; no tiene que pedir unirse.

Se emite por separado a cada participante, con `otroUsuario` armado desde el punto de vista de quien lo recibe.

---

## Amigos

### friend:request

Dirección: servidor → cliente · Room: `user:<idReceptor>` y `user:<idEmisor>`

Payload:
```json
{ "solicitud": "Solicitud" }
```

El mismo payload para los dos. El front compara `solicitud.emisor.id` con el usuario actual para ubicarla en recibidas o enviadas.

### friend:accepted

Dirección: servidor → cliente · Room: `user:<idEmisor>` y `user:<idReceptor>`

Payload:
```json
{ "idSolicitud": 7, "amigo": "Amigo" }
```

Se emite por separado a cada uno: `amigo.usuario` es siempre la otra persona desde el punto de vista de quien lo recibe.

### friend:rejected

Dirección: servidor → cliente · Room: `user:<idEmisor>` y `user:<idReceptor>`

Payload:
```json
{ "idSolicitud": 7 }
```

### friend:removed

Dirección: servidor → cliente · Room: `user:<id>` de los dos

Payload:
```json
{ "idUsuario": 1 }
```

Se emite por separado a cada uno: `idUsuario` es la otra persona de la amistad desde el punto de vista de quien lo recibe. El front la saca de la lista de amigos y marca la conversación con `puedeEscribir: false`. Los sockets siguen en la room de la conversación para poder leer el historial.

---

## Perfil

### user:updated

Dirección: servidor → cliente · Room: `user:<idAmigo>` de cada amigo (usa `getFriendIds`) y `user:<id>` propio

Payload:
```json
{ "usuario": "UsuarioPublico" }
```

Si el usuario está `INVISIBLE`, los amigos reciben `AUSENTE` y sus propias pestañas reciben el `UsuarioPublico` igual que los demás (para su perfil usan `GET /api/users/me`). El front actualiza ese usuario en su store, y se refresca en la lista de amigos, la cabecera del chat y la lista de conversaciones.

---

## Casos borde acordados

| Caso | Qué pasa |
| --- | --- |
| Usuario desconectado | No recibe nada. Al abrir la app pide por HTTP solicitudes, amigos y conversaciones. |
| Reconexión tras un corte | socket.io reconecta solo y el servidor lo vuelve a unir a sus rooms. El front vuelve a pedir por HTTP lo que esté mostrando. |
| Varias pestañas | Todas están en `user:<id>` y en sus rooms de conversación; todas reciben los eventos, incluidos los de acciones hechas desde otra pestaña. |
| Acción hecha por HTTP | La pestaña que hizo el request actualiza con la respuesta. Si después llega el evento de la misma acción, lo aplica igual: las actualizaciones son idempotentes (reemplazan por `id`, no suman). |
| Autor recibe su propio `message:new` | Se deduplica por `id` (ver `message:new`). |
| Evento con payload inválido | El servidor responde ack con `VALIDATION_ERROR` y no emite nada. |

---

## Archivos de constantes

Las dos apps mantienen las mismas claves y nombres. Contenido actual de `events.js` y `constants/events.js`:

```js
export const EVENTS = {
  CHANNEL_MESSAGE_SEND: 'channel-message:send',
  CHANNEL_MESSAGE_EDIT: 'channel-message:edit',
  CHANNEL_MESSAGE_DELETE: 'channel-message:delete',
  CHANNEL_MESSAGE_NEW: 'channel-message:new',
  CHANNEL_MESSAGE_UPDATED: 'channel-message:updated',
  CHANNEL_MESSAGE_DELETED: 'channel-message:deleted',
  CHANNEL_SUBSCRIBE: 'channel:subscribe',
  CHANNEL_UNSUBSCRIBE: 'channel:unsubscribe',
  MESSAGE_SEND: 'message:send',
  MESSAGE_EDIT: 'message:edit',
  MESSAGE_DELETE: 'message:delete',
  MESSAGE_NEW: 'message:new',
  MESSAGE_UPDATED: 'message:updated',
  MESSAGE_DELETED: 'message:deleted',
  CONVERSATION_NEW: 'conversation:new',
  FRIEND_REQUEST: 'friend:request',
  FRIEND_ACCEPTED: 'friend:accepted',
  FRIEND_REJECTED: 'friend:rejected',
  FRIEND_REMOVED: 'friend:removed',
  USER_UPDATED: 'user:updated',
  COMMUNITY_NEW: 'community:new',
  COMMUNITY_UPDATED: 'community:updated',
  COMMUNITY_DELETED: 'community:deleted',
  COMMUNITY_LEFT: 'community:left',
  COMMUNITY_MEMBER_JOINED: 'community:member-joined',
  COMMUNITY_MEMBER_LEFT: 'community:member-left',
  CHANNEL_CREATED: 'channel:created',
  CHANNEL_UPDATED: 'channel:updated',
  CHANNEL_ACCESS_LOST: 'channel:access-lost',
  CHANNEL_DELETED: 'channel:deleted',
  CHANNELS_REORDERED: 'channels:reordered',
};
```


## Suscripcion autorizada a canales (T-23)

`channel:subscribe` recibe `{ idCanal }` y responde
`{ ok: true, data: { canal } }`. Requiere una sesion vigente y VER actual;
el payload no acepta identidad, rol ni permisos. Se revisa la base en cada
solicitud y la union a `channel:id` se coordina con los cambios de acceso,
abandono y borrado. Sin VER responde CHANNEL_NOT_FOUND sin filtrar el canal.

`channel:unsubscribe` recibe `{ idCanal }` y responde
`{ ok: true, data: {} }`. Es idempotente y solo retira el socket solicitante;
requiere sesion pero permite salir aunque el canal se haya borrado.
Ambos eventos validan IDs positivos enteros; errores usan `{ ok: false, error }`.
Si la sesion fue revocada responden UNAUTHORIZED y desconectan el socket.

Reemplazar acceso retira todas las pestanas que pierden VER y emite
`channel:access-lost`. Quienes ganan o conservan acceso reciben
`channel:updated` con sus propios misPermisos. Para volver a abrir el canal
hay que suscribirse otra vez; no hace falta reconectar la sesion.
Los eventos y mensajes de F-08 implementados en T-25/T-26 siguen el contrato de [comunidades.md](comunidades.md). Estar en una room no autoriza futuras escrituras.


## Mensajes de canales (T-26)

Cliente a servidor, con ack:

- channel-message:send: { idCanal, contenido }.
- channel-message:edit: { idMensaje, contenido }.
- channel-message:delete: { idMensaje }.

Send/edit responden { ok: true, data: { mensaje } }; delete responde
{ ok: true, data: { idMensaje, idCanal, eliminadoPorModerador } }.
Los errores tienen { ok: false, error: { code, message, details? } }.
Payloads estrictos, texto recortado 1..2000 y IDs positivos de PostgreSQL.
La identidad siempre proviene de la sesion. Los mensajes se persisten antes
del ack o evento y las operaciones revalidan sesion y permisos actuales.

Servidor a cada socket suscripto con sesion vigente y VER:

- channel-message:new / channel-message:updated: { mensaje: MensajeCanal }.
- channel-message:deleted: { idMensaje, idCanal, eliminadoPorModerador }.

El DTO compartido con historial esta en utils/channelMessages.js. Los borrados
no incluyen el contenido original ni la identidad interna de auditoria. Solo el
autor edita; borrar mensajes ajenos exige jerarquia estrictamente mayor, VER y
rol MODERADOR o superior. El autor necesita ESCRIBIR para editar o borrar.
Un mensaje privado o de canal oculto no se puede modificar con estos eventos.

La pertenencia a una room no es autorizacion. emitToChannel revalida cada sesion
y los permisos actuales; retira sockets sin VER y desconecta sesiones invalidas.
Quienes no abrieron el canal no reciben estos eventos. Las pestanas del emisor
que lo tengan abierto reciben el mismo evento que los demas; deduplicar por ID
al combinarlo con el ack. Tras reconectar hay que volver a suscribirse y consultar
historial para recuperar eventos perdidos. Si se pierde un ack, revisar historial
antes de reintentar: los comandos no tienen clave de idempotencia.

La cola por comunidad coordina escrituras, cambios de acceso y publicacion
poscommit en la instancia actual. Varias instancias de API requieren adapter y
coordinacion de eventos compartida. T-15 tiene pendiente la invalidacion proactiva global;
T-26 aplica su guard de sesion especificamente al contenido de canales.

## Límites actuales

No existe `community:member-updated`: el cambio de roles y la transferencia todavía no tienen rutas/eventos implementados. Crear/revocar invitaciones tampoco emite un evento específico; el frontend reconsulta al actualizar, reconectar o volver al foco. `user:updated` se entrega al usuario y sus amigos, no a toda la comunidad.

La emisión de mensajes de canal revalida destinatarios secuencialmente y el ack espera la publicación; no se promete una latencia determinada ni se declara optimizada. La configuración actual usa una instancia de API. Varias instancias requieren un adapter y coordinación de eventos, además del bloqueo SQL del estado.
