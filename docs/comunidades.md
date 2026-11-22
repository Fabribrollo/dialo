# Contrato de comunidades y canales - Dialo

Contrato de comunidades y canales. El modelo vigente de autoridad, herencia, excepciones y acciones se detalla en [Roles y permisos granulares](roles-permisos.md). Las propuestas originales de T-13 que todavía no tienen código están separadas en el apartado de pendientes.
Cubre F-05 (comunidades), F-06 (invitaciones e integrantes), F-07 (canales y acceso) y F-08 (mensajes en canales).
Usa las convenciones de [api.md](api.md) y [sockets.md](sockets.md): rutas bajo `/api`, camelCase, formato de error compartido e historiales paginados por cursor. Los listados de comunidades, integrantes, canales e invitaciones no están paginados. Todas estas rutas requieren sesión y responden `401 UNAUTHORIZED` sin ella.
En los ejemplos, `Comunidad`, `Canal`, `Integrante` y otros nombres representan objetos de las formas compartidas, no valores JSON literales.
El chat privado (conversations y eventos message:\*) no cambia.

---

## Decisiones

- Tipos de comunidad: PUBLICA y PRIVADA.
- Roles base asignables: PROPIETARIO, ADMIN e INTEGRANTE. Los roles personalizados agregan capacidades y admiten excepciones por canal y por usuario. Moderador se migra a integrante con un rol personalizado.
- Hay un solo propietario por comunidad. No puede abandonarla; actualmente puede eliminarla. La propiedad se transfiere mediante la acción exclusiva de propietario.
- Crear una comunidad es una transaccion: comunidad + membresia PROPIETARIO del creador + canal de texto "general".
- Eliminar una comunidad: solo el propietario. Borra en cascada canales, mensajes de canal, membresias e invitaciones.
- Eliminar un canal: ADMIN o mas. Borra en cascada sus mensajes y su configuracion de acceso.
- Todos los integrantes ven el catálogo de canales. Los que no tienen VER aparecen bloqueados, sin acceso al contenido. En privados pueden solicitar ingreso.
- ADMIN y PROPIETARIO siempre tienen acceso total a todos los canales.
- Público: globales iniciales, roles y excepciones individuales. Privado: habilitaciones por rol o por persona; la excepción individual tiene prioridad. Las solicitudes las aprueban propietario o administradores.
- Una comunidad privada o un canal sin acceso responden 404, como si no existieran.
- Los canales de voz admiten llamadas, cámara y pantalla con permisos separados (F-10).
- El tipo (texto/voz) y la privacidad (público/privado) se eligen al crear el canal y no se pueden cambiar después.
- La creación solo acepta TEXTO y VOZ. VIDEO permanece como valor histórico; las migraciones convierten los anteriores a VOZ conservando su ID. Cámara y pantalla tienen permisos independientes; TRANSMITIR se interpreta por compatibilidad.
- Mensajes de canal: se envian por socket con ack, como el chat privado. El historial se pide por HTTP.
- Moderación: ELIMINAR_MENSAJES permite eliminar mensajes ajenos; protege autores propietario y administradores según autoridad. Nunca permite editarlos.
- Invitaciones: codigo aleatorio, con vencimiento y cantidad de usos opcionales. Ver una invitacion no hace ingresar.
- Rechazar una invitacion es solo del front: no llama a la API.

---

## Tipos de comunidad

Ambos tipos se pueden crear y editar. El listado `GET /api/communities` solo devuelve las comunidades de las que el usuario es integrante.

- PUBLICA: un no integrante que consulta el detalle recibe `403 NOT_MEMBER`.
- PRIVADA: un no integrante recibe `404 COMMUNITY_NOT_FOUND`.
- El ingreso implementado para ambos tipos es mediante una invitación válida. La vista previa se obtiene por `/api/invitations/:codigo` y requiere sesión.
- Pasar de PUBLICA a PRIVADA no expulsa a integrantes.

### Funcionalidades pendientes

Estas rutas de T-13 **no están implementadas** y no deben usarse como API disponible:

| Propuesta                                       | Estado                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------- |
| `GET /api/communities/explore`                  | Explorador público pendiente                                         |
| `GET /api/communities/:id/preview`              | Previa pública directa pendiente; la previa por invitación sí existe |
| `POST /api/communities/:id/join`                | Ingreso directo a públicas pendiente                                 |
| `POST /api/communities/:id/transfer`            | Transferencia pendiente                                              |
| Baneo y desbloqueo | T-41, según la jerarquía de roles base |

Los cambios de roles de integrantes emiten `community:member-updated`; transferencia y baneo quedan fuera de T-30.

---

## Roles de comunidad

PROPIETARIO tiene acceso completo, incluida eliminación y transferencia. ADMIN tiene acceso completo salvo esas acciones y modificar a otro administrador. INTEGRANTE obtiene acceso por configuración y por sus roles personalizados. Moderador ya no es asignable. La migración conserva responsabilidades anteriores mediante un rol personalizado.

## Permisos de canal

Ver [catálogo y cálculo granular](roles-permisos.md). Públicos usan globales y roles, salvo excepciones explícitas del canal. Privados requieren habilitación por rol o persona. Las excepciones individuales reemplazan la herencia, incluso si están vacías. VER es requisito; al guardar otro permiso el servidor lo agrega. Propietario y administradores conservan acceso completo.

Cámara y pantalla se controlan por CAMARA y PANTALLA; TRANSMITIR se interpreta como ambos para datos anteriores. Eliminar mensajes ajenos requiere ELIMINAR_MENSAJES y respeta autores protegidos. El catálogo bloqueado nunca habilita contenido. Solicitudes de privados se resuelven por propietario/administrador, desde su apartado específico.

---

## Formas compartidas

### Comunidad

Lo que ve un integrante.

```json
{
  "id": 4,
  "nombre": "Club de lectura",
  "imagenUrl": null,
  "tipo": "PRIVADA",
  "idPropietario": 1,
  "cantidadIntegrantes": 12,
  "miRol": "INTEGRANTE",
  "fechaCreacion": "2026-10-19T17:03:05.000Z"
}
```

### ComunidadPreview

Lo que ve alguien que no es integrante. Nunca incluye canales, integrantes ni mensajes.

```json
{
  "id": 4,
  "nombre": "Club de lectura",
  "imagenUrl": null,
  "tipo": "PRIVADA",
  "cantidadIntegrantes": 12,
  "esIntegrante": false
}
```

### Integrante

```json
{
  "usuario": "UsuarioPublico",
  "rol": "INTEGRANTE",
  "fechaIngreso": "2026-10-19T17:03:05.000Z"
}
```

### Invitacion

Requiere GESTIONAR_INVITACIONES o administración.

```json
{
  "id": 9,
  "codigo": "k3Z8pQ1xVb",
  "idComunidad": 4,
  "creador": "UsuarioPublico",
  "usosMaximos": 10,
  "usos": 3,
  "fechaExpiracion": "2026-10-20T17:03:05.000Z",
  "estado": "ACTIVA",
  "fechaCreacion": "2026-10-19T17:03:05.000Z"
}
```

- usosMaximos y fechaExpiracion pueden ser null (sin limite).
- estado: ACTIVA, VENCIDA, AGOTADA o REVOCADA. Lo calcula el servidor.
- El frontend arma `<origen actual>/invitacion/<codigo>`; no lee `CLIENT_URL`, que es configuración del backend.

### Canal

```json
{
  "id": 21,
  "idComunidad": 4,
  "nombre": "general",
  "tipo": "TEXTO",
  "privado": false,
  "posicion": 0,
  "misPermisos": ["VER", "ESCRIBIR"],
  "fechaCreacion": "2026-10-19T17:03:05.000Z"
}
```

- tipo: TEXTO, VOZ o VIDEO.
- misPermisos: permisos del usuario actual. El front decide con esto que mostrar.

### ConfiguracionAcceso

Solo ADMIN y PROPIETARIO pueden consultarla o reemplazarla.

Público: `{ "privado": false, "permisosGlobales": ["VER", "ESCRIBIR"], "habilitaciones": [] }`.
Privado: `{ "privado": true, "permisosGlobales": [], "habilitaciones": [{ "usuario": "UsuarioPublico", "permisos": ["VER"] }] }`.
En escrituras, los públicos envían únicamente privado/permisosGlobales; los privados únicamente privado/habilitaciones, con `idUsuario`. No se aceptan `rol` ni `idRol`.

### MensajeCanal

Como Mensaje del chat privado, pero con idCanal y el autor completo.

```json
{
  "id": 340,
  "idCanal": 21,
  "autor": "UsuarioPublico",
  "contenido": "Hola a todos",
  "fechaCreacion": "2026-10-19T17:03:05.000Z",
  "fechaEdicion": null,
  "eliminado": false,
  "eliminadoPorModerador": false
}
```

Si eliminado es true, contenido es null. eliminadoPorModerador indica si lo borro un moderador (la base guarda quien en id_usuario_eliminacion).

---

## Validaciones

Los parámetros HTTP y de historial usan IDs enteros positivos de PostgreSQL (máximo 2147483647); los payloads de comandos socket exigen números, no strings numéricos. Las rutas validan parámetros antes de ejecutar servicios. Los errores comunes de sesión y formato se suman a los errores específicos de cada operación.

- nombre de comunidad: 2 a 64 caracteres, sin espacios al inicio ni al final.
- tipo de comunidad: PUBLICA o PRIVADA.
- imagen de comunidad: jpg, png o webp, hasta 2 MB.
- nombre de canal: 1 a 32 caracteres, sin espacios al inicio ni al final.
- tipo de canal nuevo: TEXTO o VOZ. VIDEO se conserva solo como valor histórico migrado.
- privado: booleano.
- Los roles de comunidad se asignan mediante T-30 y no sustituyen las habilitaciones privadas de canal.
- permisos: lista sin repetidos del catálogo cerrado descrito en roles-permisos.md, filtrada por tipo de canal.
- excepciones: hasta 50 roles y 50 usuarios de la misma comunidad, sin repetidos. Una excepción vacía niega el acceso; quitar la fila restaura herencia.
- duracionHoras (invitacion): 1, 24, 168 o null (sin vencimiento).
- usosMaximos (invitacion): 1 a 100, o null (sin limite).
- orden: todos los ids de canales de la comunidad, sin repetidos.
- contenido (mensaje de canal): 1 a 2000 caracteres después de recortar extremos, conservando espacios internos.
- limit: 1 a 50.

---

## 5. Comunidades (F-05)

### GET /api/communities

Auth: si.
Comunidades del usuario, la de ingreso mas reciente primero.
200: { "items": [Comunidad] }

### POST /api/communities

Auth: si.
Body: { "nombre": "Club de lectura", "tipo": "PRIVADA" }
`tipo` es opcional; por defecto es PRIVADA.
En una transaccion crea la comunidad, la membresia PROPIETARIO del usuario y el canal "general" (TEXTO, publico). El propietario sale de la sesion: el body no acepta idPropietario. La imagen se sube despues.
201: { "comunidad": Comunidad }
Socket: community:new a user:id propio, y une sus sockets a community:id.
Errores: 400 VALIDATION_ERROR.

### GET /api/communities/:id

Auth: si. Integrante.
200: { "comunidad": Comunidad }
Errores:

- 404 COMMUNITY_NOT_FOUND: no existe, o es privada y no es integrante.
- 403 NOT_MEMBER: es publica y no es integrante.

### PATCH /api/communities/:id

Auth: si. ADMIN o mas.
Body (al menos uno): { "nombre": "Club 2026", "tipo": "PUBLICA" }
200: { "comunidad": Comunidad }
Socket: community:updated a community:id.
Errores:

- 400 VALIDATION_ERROR: campos invalidos, body vacio o campos protegidos (id, idPropietario).
- 403 INSUFFICIENT_ROLE.
- 404 COMMUNITY_NOT_FOUND.

### POST /api/communities/:id/imagen

Auth: si. ADMIN o mas.
multipart/form-data con el campo "imagen". Cloudinary en dialo/communities/comunidad-id (256x256, WebP). Una imagen por comunidad.
200: { "comunidad": Comunidad }
Socket: community:updated.
Errores: 400 INVALID_FILE, 403 INSUFFICIENT_ROLE, 404 COMMUNITY_NOT_FOUND.

### DELETE /api/communities/:id

Auth: si. PROPIETARIO.
Borra la comunidad y en cascada canales, mensajes de canal, membresias e invitaciones. No toca amistades ni conversaciones privadas. 204.
Socket: community:deleted a community:id, y despues saca a todos los sockets de community:id y de sus canales.
Errores: 403 INSUFFICIENT_ROLE, 404 COMMUNITY_NOT_FOUND.

---

## 6. Ingreso e integrantes (F-06)

### POST /api/communities/:id/leave

Auth: si. Integrante. 204.
Socket: community:member-left a community:id y community:left a user:id propio. Saca sus sockets de community:id y de sus canales.
Errores:

- 409 OWNER_CANNOT_LEAVE: es el propietario.
- 404 COMMUNITY_NOT_FOUND.

### GET /api/communities/:id/members

Auth: si. Integrante.
Ordenados por rol (mayor primero), después por nombreVisible y por ID de usuario como desempate.
200: { "items": [Integrante] }

---

## 7. Invitaciones (F-06)

### POST /api/communities/:id/invitations

Requiere GESTIONAR_INVITACIONES o administración.
Body JSON: { "duracionHoras": 24, "usosMaximos": 10 }
Los dos campos son opcionales y por defecto son null; para omitirlos enviar `{}`.
201: { "invitacion": Invitacion }
Errores: 400 VALIDATION_ERROR, 403 INSUFFICIENT_ROLE, 404 COMMUNITY_NOT_FOUND.

### GET /api/communities/:id/invitations

Requiere GESTIONAR_INVITACIONES o administración.
Todas las invitaciones de la comunidad, mas nuevas primero.
200: { "items": [Invitacion] }

### DELETE /api/communities/:id/invitations/:idInvitacion

Requiere GESTIONAR_INVITACIONES o administración.
Revoca la invitación (queda guardada con estado REVOCADA). Responde 204; repetirlo también responde 204.
Errores: 403 INSUFFICIENT_ROLE, 404 INVITATION_NOT_FOUND.

### GET /api/invitations/:codigo

Auth: si.
Vista previa: muestra la comunidad sin hacer ingresar al usuario.
200: { "comunidad": ComunidadPreview }
Errores:

- 404 INVITATION_NOT_FOUND: el codigo no existe.
- 410 INVITATION_EXPIRED: vencio.
- 410 INVITATION_REVOKED: fue revocada.
- 410 INVITATION_EXHAUSTED: llego al maximo de usos.

### POST /api/invitations/:codigo/accept

Auth: si.
Ingresa con rol INTEGRANTE y suma un uso, en una transacción. Primero exige que la invitación esté activa; incluso un integrante existente recibe el error de una invitación vencida/revocada/agotada. Si está activa y ya es integrante no consume un uso. Dos aceptaciones al mismo tiempo no pueden superar el máximo.
201 si ingreso, 200 si ya era integrante: { "comunidad": Comunidad }
Socket (si ingresó): une sus sockets a `community:id`, emite `community:member-joined` a esa room y `community:new` a `user:id` propio.
Errores: los mismos que la vista previa.

---

## 8. Canales (F-07)

### GET /api/communities/:id/channels

Auth: si. Integrante.
Todos los canales de esa comunidad, ordenados por posición e id. Incluye `bloqueado`, `misPermisos` y el estado de solicitud propio. No incluye mensajes ni configuración de terceros.
200: { "items": [Canal] }

### POST /api/communities/:id/channels

Auth: si. ADMIN o mas.
Body: { "nombre": "anuncios", "tipo": "TEXTO", "privado": false, "permisosGlobales": ["VER"] }
privado es opcional (false por defecto). El canal y los permisos iniciales se guardan juntos y se agrega al final. Si se omiten globales en público, usa VER/ESCRIBIR para texto y VER/HABLAR para voz. Los privados arrancan sin habilitaciones.
201: { "canal": Canal }
Socket: channel:created a cada integrante con VER (con su misPermisos).
Errores: 400 VALIDATION_ERROR, 403 INSUFFICIENT_ROLE, 404 COMMUNITY_NOT_FOUND.

### GET /api/channels/:id

Auth: si. VER.
200: { "canal": Canal }
Errores: 404 CHANNEL_NOT_FOUND si no existe o no tiene VER.

### PATCH /api/channels/:id

Auth: si. ADMIN o mas.
Body: { "nombre": "avisos" }. `tipo` y `privado` no se aceptan en PATCH: ambos quedan fijos al crear el canal.
200: { "canal": Canal }
Socket: channel:updated a quienes tienen VER y channel:access-lost a quienes lo perdieron.
Errores:

- 400 VALIDATION_ERROR (incluye mandar `tipo`).
- 403 INSUFFICIENT_ROLE.
- 404 CHANNEL_NOT_FOUND.

### PUT /api/communities/:id/channels/order

Auth: si. ADMIN o mas.
Body: { "orden": [21, 25, 22, 23] }
Tiene que incluir todos los canales de la comunidad, una vez cada uno. Se guarda en una transaccion. 204.
Socket: channels:reordered a user:id de cada integrante, con solo los IDs que puede ver.
Errores:

- 400 INVALID_ORDER: faltan canales, hay repetidos o hay canales de otra comunidad.
- 403 INSUFFICIENT_ROLE.
- 404 COMMUNITY_NOT_FOUND.

### DELETE /api/channels/:id

Auth: si. ADMIN o mas.
Borra el canal, sus mensajes y su configuracion de acceso. 204.
Socket: channel:deleted a user:id de quienes tenian VER, y saca a todos los sockets de channel:id.
Errores: 403 INSUFFICIENT_ROLE, 404 CHANNEL_NOT_FOUND.

### GET /api/channels/:id/access

Auth: si. ADMIN o mas.
200: { "acceso": ConfiguracionAcceso }

### PUT /api/channels/:id/access

Requiere autoridad administrativa o GESTIONAR_CANALES en ese canal. Reemplaza la configuración completa dentro del bloqueo de comunidad.

`{ "privado": false, "permisosGlobales": ["VER"], "roles": [{"idRol": 3, "permisos": ["VER", "ESCRIBIR"]}], "habilitaciones": [{"idUsuario": 7, "permisos": []}] }`.

En privado, enviar `privado:true`, globales vacíos y los roles/personas habilitados. Roles y personas deben pertenecer a la misma comunidad; sin duplicados, hasta 50 de cada uno. Una excepción individual vacía niega acceso; quitarla restaura herencia. El campo `privado` debe coincidir con el canal (`409 CHANNEL_PRIVACY_IMMUTABLE` si intenta convertirlo). Las reglas de combinación y los permisos válidos están en [Roles y permisos](roles-permisos.md).

### Solicitudes de acceso a canal privado

- `POST /api/channels/:id/requests` con `{}`: integrante sin acceso solicita ingreso; devuelve `{ solicitud: { id, estado } }`. Repetir mientras está pendiente es idempotente. Tras rechazo se permite volver a solicitar.
- `GET /api/channels/:id/requests`: solo propietario/admin; hasta 50 pendientes ordenados por antigüedad. Resolver pedidos recarga la cola para consultar los siguientes.
- `POST /api/channels/:id/requests/:solicitud` con `{ "aceptar": true, "permisos": ["VER"] }` o `{ "aceptar": false }`: solo propietario/admin. Aceptar exige permisos aplicables no vacíos y crea la habilitación individual atómicamente; rechazar no concede acceso. Una decisión repetida idéntica no duplica avisos; una decisión incompatible devuelve 409.

Las solicitudes se eliminan al abandonar, ser baneado, borrarse el canal o la comunidad. Cada operación vuelve a comprobar sesión, membresía, privacidad y autoridad. Moderadores e integrantes no pueden aprobar pedidos. Se usan avisos persistentes y eventos posteriores al commit para ambas partes.

---

## 9. Mensajes de canal (F-08)

### GET /api/channels/:id/messages?cursor=340&limit=30

Auth: si. VER.
Igual que el historial del chat privado: mas nuevos primero, cursor = id del mensaje mas viejo que ya tiene el front, limit 30 por defecto (1 a 50). Los eliminados vienen con contenido null.
200: { "items": [MensajeCanal], "nextCursor": 311 }
Errores:

- 404 CHANNEL_NOT_FOUND: no existe o no tiene VER.
- 400 VALIDATION_ERROR: parametros invalidos, cursor inexistente o de otro canal/chat.
- 400 CHANNEL_NOT_TEXT: el canal visible no es de texto.

Enviar, editar y eliminar: por socket (ver abajo).

---

## Eventos de socket

### Rooms nuevas

- community:id: todos los sockets de los integrantes. Al conectarse, el servidor une el socket a las comunidades del usuario.
- channel:id: los sockets que tienen el canal abierto. El cliente se une con channel:subscribe (el servidor revisa VER) y sale con channel:unsubscribe.

### Cliente a servidor (con ack, como en sockets.md)

channel:subscribe

- Payload: { "idCanal": 21 }
- Ack ok: { "ok": true, "data": { "canal": Canal } }
- Errores: CHANNEL_NOT_FOUND, VALIDATION_ERROR, UNAUTHORIZED.

channel:unsubscribe

- Payload: { "idCanal": 21 }
- Ack ok: { "ok": true, "data": {} }
- Errores: VALIDATION_ERROR, UNAUTHORIZED. Permite salir aunque el canal ya no exista.

channel-message:send

- Payload: { "idCanal": 21, "contenido": "Hola" }
- Requiere ESCRIBIR. Guarda el mensaje y emite channel-message:new a channel:id.
- Ack ok: { "ok": true, "data": { "mensaje": MensajeCanal } }
- Errores: VALIDATION_ERROR, CHANNEL_NOT_FOUND, CHANNEL_NOT_TEXT, NO_WRITE_PERMISSION, UNAUTHORIZED.

channel-message:edit

- Payload: { "idMensaje": 340, "contenido": "Hola (editado)" }
- Solo el autor, y necesita ESCRIBIR. Emite channel-message:updated.
- Ack ok: { "ok": true, "data": { "mensaje": MensajeCanal } }
- Errores: VALIDATION_ERROR, MESSAGE_NOT_FOUND, CHANNEL_NOT_TEXT, NOT_AUTHOR, MESSAGE_DELETED, NO_WRITE_PERMISSION, UNAUTHORIZED.

channel-message:delete

- Payload: { "idMensaje": 340 }
- El autor con ESCRIBIR o quien tiene ELIMINAR_MENSAJES, respetando autores protegidos. Emite channel-message:deleted.
- Ack ok: { "ok": true, "data": { "idMensaje": 340, "idCanal": 21, "eliminadoPorModerador": true } }
- Errores: VALIDATION_ERROR, MESSAGE_NOT_FOUND, CHANNEL_NOT_TEXT, MESSAGE_DELETED, CANNOT_DELETE_MESSAGE, UNAUTHORIZED.

### Servidor a cliente

Comunidades:

- community:new a user:id. Payload { "comunidad": Comunidad }. Se creo o se ingreso a una comunidad.
- community:updated a community:id. Payload { "comunidad": Comunidad sin miRol }. El front conserva su propio rol y reconsulta; el evento no lleva un rol común para todos.
- community:deleted a community:id. Payload { "idComunidad": 4 }.
- community:left a user:id. Payload { "idComunidad": 4 }. Para las otras pestanas de quien abandono.
- community:member-joined a community:id. Payload { "idComunidad": 4, "integrante": Integrante }.
- community:member-left a community:id. Payload { "idComunidad": 4, "idUsuario": 7 }.

Canales:

- channel:created a user:id de cada integrante con VER. Payload { "canal": Canal }.
- channel:updated a user:id de cada integrante con VER. Payload { "canal": Canal }. Tambien lo recibe quien gano acceso.
- channel:deleted a user:id de cada integrante que tenia VER. Payload { "idComunidad": 4, "idCanal": 21 }.
- channel:access-lost a user:id. Payload { "idComunidad": 4, "idCanal": 21 }.
- channels:reordered a user:id de cada integrante. Payload { "idComunidad": 4, "orden": [21, 25, 22] }, filtrado a sus canales visibles.

Mensajes de canal:

- channel-message:new a channel:id. Payload { "mensaje": MensajeCanal }.
- channel-message:updated a channel:id. Payload { "mensaje": MensajeCanal }.
- channel-message:deleted a channel:id. Payload { "idMensaje": 340, "idCanal": 21, "eliminadoPorModerador": true }.

### Perdida de acceso

Al reemplazar los permisos, el servidor retira de `channel:id` las pestañas que pierden VER y envía `channel:access-lost` a `user:id`. El frontend desmonta mensajes/llamadas y muestra el canal bloqueado, reconsultando el catálogo. Quienes ganan o conservan VER reciben `channel:updated` con permisos propios; recuperar acceso permite resuscribirse, sin unión automática.

Otros retiros tienen eventos distintos:

- Abandono: retira rooms de comunidad/canales, informa `community:member-left` a quienes permanecen y `community:left` a las pestañas del usuario que salió.
- Eliminación del canal: cierra su room y envía `channel:deleted` a quienes tenían VER.
- Eliminación de comunidad: emite `community:deleted` y cierra sus rooms y las de sus canales.

No se emite adicionalmente `channel:access-lost` por cada canal en todos esos casos. Los cambios de rol no se contemplan como operación disponible porque aún no hay endpoint. Toda operación HTTP/socket comprueba permisos actuales, no solo los del momento de la suscripción.

### Constantes nuevas para events.js (back y front)

```js
COMMUNITY_NEW: 'community:new',
COMMUNITY_UPDATED: 'community:updated',
COMMUNITY_DELETED: 'community:deleted',
COMMUNITY_LEFT: 'community:left',
COMMUNITY_MEMBER_JOINED: 'community:member-joined',
COMMUNITY_MEMBER_LEFT: 'community:member-left',
CHANNEL_SUBSCRIBE: 'channel:subscribe',
CHANNEL_UNSUBSCRIBE: 'channel:unsubscribe',
CHANNEL_CREATED: 'channel:created',
CHANNEL_UPDATED: 'channel:updated',
CHANNEL_DELETED: 'channel:deleted',
CHANNEL_ACCESS_LOST: 'channel:access-lost',
CHANNELS_REORDERED: 'channels:reordered',
CHANNEL_MESSAGE_SEND: 'channel-message:send',
CHANNEL_MESSAGE_EDIT: 'channel-message:edit',
CHANNEL_MESSAGE_DELETE: 'channel-message:delete',
CHANNEL_MESSAGE_NEW: 'channel-message:new',
CHANNEL_MESSAGE_UPDATED: 'channel-message:updated',
CHANNEL_MESSAGE_DELETED: 'channel-message:deleted',
```

---

## Rutas del front

- `/comunidades`: comunidades propias, sin explorador público.
- `/comunidades/nueva` y `/comunidades/:id/editar`: formularios autorizados.
- `/comunidades/:id`: resumen con canales e integrantes reales.
- `/comunidades/:id/integrantes` y `/comunidades/:id/invitaciones`: listas y administración autorizada.
- `/comunidades/:id/canales`, `/comunidades/:id/canales/nuevo` y `/comunidades/:id/canales/:canalId`: catálogo, creación y chat/configuración.
- `/invitacion/:codigo`: previa, Aceptar y Rechazar; sin sesión conserva un destino interno validado y vuelve después de login/registro.

VOZ/VIDEO muestran que las llamadas aún no están disponibles. El comportamiento de interfaz se detalla en [frontend.md](frontend.md).

---

## Funciones compartidas

Para no repetir las reglas de permisos en cada feature.

- getMembership(idComunidad, idUsuario): devuelve { rol } o null. En services/communitiesService.js. La usan los servicios de comunidades/invitaciones.
- requireRole(idComunidad, idUsuario, rolMinimo, db?): devuelve { rol }; puede lanzar 404 COMMUNITY_NOT_FOUND, 403 NOT_MEMBER o 403 INSUFFICIENT_ROLE. En services/communitiesService.js.
- getChannelPermissions(idCanal, idUsuario): devuelve la lista de permisos efectivos (vacia si no es integrante). En services/channelsService.js. La usan canales, mensajes y sockets.
- emitToCommunity(idComunidad, evento, payload), joinCommunity(idComunidad, idsUsuarios), leaveCommunity(idComunidad, idUsuario, idsCanales): en sockets/emitter.js.
- emitToChannel(idCanal, evento, payload), leaveChannel(idCanal, idUsuario): en sockets/emitter.js.

---

## Implementación compartida y errores

Nota de T-22: las notificaciones de eliminacion y orden se envian por usuario
para evitar difundir IDs de canales privados a quienes no tienen VER. Los
nombres de eventos y las formas del payload se mantienen. La orden enviada por
un administrador a PUT sigue incluyendo todos los canales de la comunidad.

### Implementación y coordinación de canales

Estan implementados listado, creacion, detalle, actualizacion, ordenamiento y
eliminacion. La evaluacion de permisos existente se reutiliza desde
getChannelPermissions(idCanal, idUsuario); devuelve [] si no existe o no hay
membresia. GET/PUT /channels/:id/access y channel:subscribe/unsubscribe estan
implementados en T-23. La administración visual se implementó en T-24, el historial/mensajería en T-25/T-26 y la interfaz integrada en T-27.

Las escrituras de canales adquieren FOR UPDATE sobre la comunidad dentro de una
transaccion. Esto coordina creacion, orden, modificacion y eliminacion entre
procesos. withCommunityChannelsLock(idComunidad, operation) vive ahora en
utils/communityChannelsLock.js (se reexporta desde channelsService). Lo usan
tambien el reemplazo de acceso, la suscripcion, el abandono y el borrado de la
comunidad. T-26 lo utiliza para coordinar mensajes con cambios de acceso/tipo y publicación posterior al commit.

El cambio de TEXTO a VOZ/VIDEO se rechaza si existe cualquier mensaje, incluidos
los eliminados logicamente. Eliminar el canal aplica las cascadas del modelo.

requireRole admite un cuarto argumento db opcional para verificar permisos con
el cliente de una transaccion, conservando el comportamiento de los llamados
anteriores que no lo utilizan. No hay nueva migracion ni dependencia.

- COMMUNITY_NOT_FOUND (404): communities.
- NOT_MEMBER (403): communities.
- INSUFFICIENT_ROLE (403): communities, invitations, channels.
- MEMBER_NOT_FOUND (404): members, channels.
- OWNER_CANNOT_LEAVE (409): members.
- INVITATION_NOT_FOUND (404): invitations.
- INVITATION_EXPIRED (410): invitations.
- INVITATION_REVOKED (410): invitations.
- INVITATION_EXHAUSTED (410): invitations.
- CHANNEL_NOT_FOUND (404): channels.
- INVALID_ORDER (400): channels.
- CHANNEL_NOT_TEXT (400): historial y mensajes de canal.
- NO_WRITE_PERMISSION (403): mensajes de canal (socket).
- NO_CHANNEL_PERMISSION (403) y CANNOT_MODERATE_CHANNEL (403): helpers de autorización; no implican una ruta de llamadas/moderación adicional.
- CANNOT_DELETE_MESSAGE (403): mensajes de canal (socket).
- Se reusan MESSAGE_NOT_FOUND, NOT_AUTHOR y MESSAGE_DELETED.

### Autorización compartida y configuración de acceso

La autorización se centraliza en `effectiveChannelPermissions`, `requireChannelPermission` y `withChannelPermission`. El servidor consulta sesión, membresía, roles y excepciones actuales en cada operación. GET/PUT access requieren GESTIONAR_CANALES o autoridad administrativa; no permiten cambiar privacidad. `withCommunityAccessChange` coordina cambios de roles, membresía y silencio con mensajes, suscripciones y fuentes de llamada. Los eventos se emiten después del commit; perder VER retira suscripciones y llamadas, y perder publicación ajusta las fuentes de LiveKit.

El catálogo puede mostrar canales bloqueados, pero el contenido exige VER. Las habilitaciones individuales no cambian el rol base. Los DTO no exponen credenciales ni correo. Ver [contrato granular](roles-permisos.md) para las reglas de herencia y excepciones.

### Historial de canales implementado (T-25)

GET /api/channels/:id/messages esta implementado para TEXTO. Requiere sesion,
membresia y VER actuales, sin exigir ESCRIBIR. La autorizacion se realiza antes
de consultar el tipo o validar pertenencia del cursor, para no revelar mensajes
o metadatos de canales ocultos. Los parametros deben ser IDs enteros positivos
de PostgreSQL; limit va de 1 a 50, con 30 por defecto. No acepta query ajena al
contrato. Un canal inexistente o sin VER responde CHANNEL_NOT_FOUND (404).

Cada pagina se ejecuta mediante withChannelPermission, bajo el bloqueo de
comunidad compartido con acceso, abandono, tipo y eliminacion. Una consulta
iniciada mientras habia VER puede finalizar antes de una revocacion; las
consultas posteriores a esa revocacion no mantienen autorizacion en cache.

Orden: fechaCreacion descendente y luego id descendente. cursor identifica un
mensaje del mismo canal, incluso si esta eliminado logicamente. La consulta
usa la dupla fecha/id y toma limit + 1 para decidir nextCursor; devuelve null
si no existe otra pagina. La paginacion de un historial sin cambios no repite ni
omite mensajes. No es una foto congelada: inserciones posteriores se recuperan
al recargar y las ediciones/eliminaciones se reflejan en la consulta siguiente.

El DTO MensajeCanal contiene id, idCanal, autor (UsuarioPublico), contenido,
fechaCreacion, fechaEdicion, eliminado y eliminadoPorModerador. Se reutiliza el
selector y mapeo publico de autores, incluida la conversion INVISIBLE a AUSENTE.
No expone correo, hashes, sesion, idConversacion ni identidad interna de quien
elimino. El contenido de un mensaje eliminado es null. eliminadoPorModerador
es true si la eliminacion registrada tiene un actor distinto del autor; si la
referencia de auditoria es null, no se infiere un moderador desconocido.

utils/channelMessages.js exporta channelMessageSelect y
toChannelMessage. La paginacion reutiliza olderMessagesWhere de utils/messages.js,
compartida con el historial privado sin modificar su orden ni contrato.
services/channelMessagesService.js exporta listChannelMessages.

El historial es HTTP; envío/edición/eliminación están implementados por socket en T-26 y la interfaz en T-27. Las pruebas de paginación insertan fixtures en una base exclusiva; el smoke específico de T-25 conserva su alcance de canales vacíos. El smoke T-26 sí prueba paginación con mensajes reales.

### Mensajeria en tiempo real implementada (T-26)

Estan implementados channel-message:send/edit/delete y sus eventos new/updated/
deleted, con las formas definidas arriba. Send y edit confirman
{ ok: true, data: { mensaje: MensajeCanal } }. Delete confirma
{ ok: true, data: { idMensaje, idCanal, eliminadoPorModerador } }.
Errores usan { ok: false, error: { code, message, details? } }.
Los payloads son estrictos: no admiten identidad, rol, auditoria ni campos extra.
El texto se recorta y debe tener 1..2000 caracteres. Los IDs son enteros positivos
de PostgreSQL. Un evento sin callback se procesa sin interrumpir el servidor.

El emisor sale de la sesion. Los handlers esperan las rooms iniciales y revisan
la sesion antes del payload, otra vez al ejecutar la escritura dentro de su
transaccion y antes del ack. Conocer el canal o un mensaje no concede acceso.
Se requiere TEXTO y VER; send y edit propio exigen ESCRIBIR. Moderar no permite
editar mensajes ajenos. En edit/delete un mensaje privado, inexistente o de
canal inaccesible responde MESSAGE_NOT_FOUND sin divulgar contenido.

Delete es logico: conserva contenido en la base para auditoria pero lo oculta
en historial/DTO/eventos. Guarda fechaEliminacion e idUsuarioEliminacion.
El autor requiere ESCRIBIR. Otra persona necesita VER y ELIMINAR_MENSAJES. Los autores propietario y administradores están protegidos según la autoridad del solicitante. VER/ESCRIBIR solos no conceden moderación.

Las escrituras usan el mismo bloqueo por comunidad que acceso, suscripciones,
tipo, abandono y borrado. withCommunityChannelsLock admite un cuarto argumento
opcional afterCommit(saved). withChannelPermission y mutateChannel lo reciben
como ultimo argumento opcional. La transaccion confirma antes del callback;
una cola por comunidad abarca transaccion y publicacion en esta instancia.
La cola se libera tambien ante errores. Esto impide que ediciones aparezcan
despues del evento de borrado y ordena revocaciones con nuevas publicaciones.
No se reutilizan transacciones globales dentro de una transaccion: los helpers
de autenticacion aceptan db opcional y las escrituras pasan tx.

emitToChannel verifica destinatarios de la room en cada entrega: sesion vigente
y VER actual. No se envia automaticamente a todas las membresias o pestanas;
solo a sockets suscriptos. Una sesion vencida/revocada se desconecta antes de
recibir contenido; otra sesion valida del mismo usuario sigue funcionando.
Un socket sin VER sale de la room aunque hubiera quedado unido por error.
La lista de permisos se comparte solo dentro de esa publicacion, nunca entre
mensajes. Si no se puede comprobar la sesion, no se entrega contenido.

T-15 sigue siendo responsable de la invalidacion global/proactiva de sesiones.
El guard de T-26 protege mensajes de canal sin esperar esa tarea; no modifica
la distribucion de mensajes privados ni agrega un barrido periodico de sesiones.

La serializacion de publicaciones corresponde a una instancia activa de la API,
como la configuracion actual de Socket.IO. El bloqueo SQL protege el estado entre
conexiones, pero varias instancias requieren un adapter y coordinacion de eventos
compartidos (por ejemplo, un outbox); no se declara resuelta esa distribucion.
Si se pierde un ack o la conexion despues del commit, el mensaje puede estar
guardado: el cliente debe reconciliar historial y deduplicar ack/evento por ID.
No existe una clave de idempotencia de comandos en el contrato actual.

La interfaz integrada de T-27 consume estos eventos y el historial de T-25. La validación reproducible del backend se describe en [test/README.md](../apps/backend/test/README.md); no declarar completa T-15 por las comprobaciones específicas de canales.

## Roles personalizados y autoridad vigente

El contrato completo está en [Roles y permisos granulares](roles-permisos.md): catálogo cerrado de capacidades, roles heredados, admisión privada individual, solicitudes, restricciones de administrador, expulsión de canal y silencio persistente.

### Catálogo y asignación

GET/POST `/api/communities/:id/roles`, GET/PATCH/DELETE `/api/communities/:id/roles/:idRol`. La creación y edición aceptan `{nombre,permisos?}` y devuelven `{rol:{id,idComunidad,nombre,permisos,fechaCreacion}}`. Los integrantes pueden consultar; administrar requiere ADMIN/PROPIETARIO. No se delegan las acciones administrativas en roles personalizados.

POST `/api/communities/:id/roles/suggestion` acepta `{descripcion}` y devuelve una propuesta validada, sin guardarla. Si no hay proveedor/modelo configurados, devuelve AI_UNAVAILABLE y permite completar manualmente.

PATCH `/api/communities/:id/members/:idUsuario` recibe `{rol?:"ADMIN"|"INTEGRANTE",idsRoles?:[2,3]}`. Omitir conserva; lista vacía quita los personalizados. No se asigna PROPIETARIO ni MODERADOR. Un administrador puede promover a otro integrante; solo el propietario puede modificar a otro administrador. La transferencia usa su ruta exclusiva.

### Baneo y expulsión

GET/PUT/DELETE `/api/communities/:id/bans[/:idUsuario]` requieren ADMIN/PROPIETARIO. PUT acepta `{motivo?,duracion?}` con 30_MIN, 5_HORAS o PERMANENTE. Solo propietario puede actuar sobre administradores; nunca sobre sí mismo. Vencer o levantar un baneo permite el ingreso normal sin restaurar membresía.

POST `/api/communities/:id/members/:idUsuario/kick` es una salida global reservada a administración. EXPULSAR configurable actúa únicamente sobre un canal: público queda excluido hasta restaurarlo, privado pierde la admisión y puede volver a solicitarla. Ver el contrato granular.

### Migraciones de T-42

Se conservan las migraciones históricas `20261120220000_permisos_base_publicos` y `20261120230000_solicitudes_canales`, que materializan accesos anteriores e incorporan solicitudes. `20261121010000_permisos_granulares` agrega capacidades, excepciones vacías, silencio persistente y la conversión de Moderador a un rol personalizado. La migración posterior `20261121011000_moderacion_privada_previa` conserva la moderación de privados de texto ya habilitados. No abre privados por roles globales ni borra mensajes.

La migración `20261121190000_armonia_chat` actualiza el contrato: materializa admisiones privadas por rol, conserva denegaciones públicas como expulsiones y retira excepciones de rol/delegación de baneo. Ver [armonía de interfaz](armonia-interfaz.md).
