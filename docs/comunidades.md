# Contrato de comunidades y canales - Dialo (Entrega 50%)

Contrato implementado hasta T-27. Las propuestas originales de T-13 que todavía no tienen código están separadas en el apartado de pendientes.
Cubre F-05 (comunidades), F-06 (invitaciones e integrantes), F-07 (canales y acceso) y F-08 (mensajes en canales).
Usa las convenciones de [api.md](api.md) y [sockets.md](sockets.md): rutas bajo `/api`, camelCase, formato de error compartido e historiales paginados por cursor. Los listados de comunidades, integrantes, canales e invitaciones no están paginados. Todas estas rutas requieren sesión y responden `401 UNAUTHORIZED` sin ella.
En los ejemplos, `Comunidad`, `Canal`, `Integrante` y otros nombres representan objetos de las formas compartidas, no valores JSON literales.
El chat privado (conversations y eventos message:\*) no cambia.

---

## Decisiones

- Tipos de comunidad: PUBLICA y PRIVADA.
- Roles base: PROPIETARIO, ADMIN, MODERADOR, INTEGRANTE. Uno por integrante. Los roles personalizados quedan para F-09.
- Hay un solo propietario por comunidad. No puede abandonarla; actualmente puede eliminarla. Transferir la propiedad sigue pendiente.
- Crear una comunidad es una transaccion: comunidad + membresia PROPIETARIO del creador + canal de texto "general".
- Eliminar una comunidad: solo el propietario. Borra en cascada canales, mensajes de canal, membresias e invitaciones.
- Eliminar un canal: ADMIN o mas. Borra en cascada sus mensajes y su configuracion de acceso.
- Canal publico: lo ven todos los integrantes. Canal privado: solo los habilitados por rol o por usuario.
- ADMIN y PROPIETARIO siempre tienen acceso total a todos los canales.
- Los permisos se suman. No hay permisos de denegacion en esta entrega.
- Una comunidad privada o un canal sin acceso responden 404, como si no existieran.
- Los canales de voz y video se crean y configuran, pero no hay llamadas (eso es F-10).
- Cambio de tipo de canal: libre entre VOZ y VIDEO y hacia TEXTO. De TEXTO a VOZ o VIDEO solo si no tiene mensajes.
- Mensajes de canal: se envian por socket con ack, como el chat privado. El historial se pide por HTTP.
- Moderacion: MODERADOR o mas puede eliminar mensajes ajenos (nunca editarlos), salvo de alguien con rol igual o mayor.
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

| Propuesta | Estado |
| --- | --- |
| `GET /api/communities/explore` | Explorador público pendiente |
| `GET /api/communities/:id/preview` | Previa pública directa pendiente; la previa por invitación sí existe |
| `POST /api/communities/:id/join` | Ingreso directo a públicas pendiente |
| `POST /api/communities/:id/transfer` | Transferencia pendiente |
| `PATCH /api/communities/:id/members/:idUsuario` | Cambio de roles pendiente, dentro de la administración futura |
| Expulsión y roles personalizados | Fuera de la implementación actual |

Tampoco existe el evento `community:member-updated`. Las futuras operaciones deberán conservar la jerarquía y coordinar cambios de permisos/rooms; esta guía no las presenta como garantías actuales.

---

## Roles de comunidad

Jerarquia: PROPIETARIO (4) > ADMIN (3) > MODERADOR (2) > INTEGRANTE (1).

Que puede hacer cada rol (cada rol puede todo lo de los roles menores):

- INTEGRANTE: ver la comunidad, sus integrantes y los canales a los que tiene acceso. Abandonar la comunidad si no es propietario.
- MODERADOR: crear, listar y revocar invitaciones. Eliminar mensajes ajenos en canales donde tiene VER.
- ADMIN: editar nombre, imagen y tipo de la comunidad. Crear, editar, ordenar y eliminar canales y configurar su acceso.
- PROPIETARIO: las acciones de ADMIN y eliminar la comunidad. No puede abandonar. Asignación de roles y transferencia no están implementadas.

La moderación exige jerarquía estrictamente superior al rol actual del autor del mensaje. No permite editar mensajes ajenos. Un autor que abandonó tiene rango cero. Los roles de fixtures/seed no implican que exista una API para cambiarlos.

---

## Permisos de canal

- VER (todos los tipos): ver y abrir el canal. En TEXTO permite leer historial y recibir mensajes; no habilita llamadas todavía.
- ESCRIBIR (TEXTO): enviar mensajes. Editar y eliminar los propios tambien lo requiere.
- HABLAR (VOZ, VIDEO): hablar en la llamada. Se guarda ahora, se usa en F-10.
- TRANSMITIR (VOZ, VIDEO): camara y pantalla. Se guarda ahora, se usa en F-10.

Cualquier permiso implica VER: si se guarda ESCRIBIR sin VER, el servidor agrega VER.

Como se calculan los permisos de un integrante en un canal:

1. Si es PROPIETARIO o ADMIN: todos los permisos del tipo de canal.
2. Si el canal es publico, empieza con los permisos por defecto:
   - TEXTO: VER y ESCRIBIR.
   - VOZ y VIDEO: VER y HABLAR.
3. Si el canal es privado, empieza sin permisos.
4. Se suman los permisos de la habilitacion de su rol (si existe) y de la habilitacion de su usuario (si existe).
5. Se descartan los permisos que no aplican al tipo de canal (por ejemplo ESCRIBIR en un canal de voz).

Ejemplo de conflicto: si el rol da VER y la habilitacion del usuario da VER y ESCRIBIR, queda VER y ESCRIBIR.
Para hacer un canal de solo lectura: canal privado con la habilitacion INTEGRANTE: [VER].

Moderar no es un permiso configurable en esta entrega: lo tiene quien es MODERADOR o mas y tiene VER en el canal.

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
  "miRol": "MODERADOR",
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
  "rol": "MODERADOR",
  "fechaIngreso": "2026-10-19T17:03:05.000Z"
}
```

### Invitacion

Solo la ven MODERADOR o mas.

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

Solo la ven ADMIN o mas.

```json
{
  "privado": true,
  "habilitaciones": [
    { "rol": "MODERADOR", "permisos": ["VER", "ESCRIBIR"] },
    { "rol": "INTEGRANTE", "permisos": ["VER"] },
    { "usuario": "UsuarioPublico", "permisos": ["VER", "ESCRIBIR"] }
  ]
}
```

Cada habilitacion tiene rol o usuario, nunca los dos. Solo se admiten los roles MODERADOR e INTEGRANTE (los demas ya tienen todo).

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
- tipo de canal: TEXTO, VOZ o VIDEO.
- privado: booleano.
- Los roles existen en el modelo; no hay un payload de asignación implementado.
- permisos: lista sin repetidos de VER, ESCRIBIR, HABLAR, TRANSMITIR.
- habilitaciones: hasta 50, sin repetir rol ni usuario. Una lista de permisos
  vacia equivale a omitir esa habilitacion: no se guarda una fila vacia ni
  deniega los permisos obtenidos por otra via.
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

Auth: si. MODERADOR o mas.
Body JSON: { "duracionHoras": 24, "usosMaximos": 10 }
Los dos campos son opcionales y por defecto son null; para omitirlos enviar `{}`.
201: { "invitacion": Invitacion }
Errores: 400 VALIDATION_ERROR, 403 INSUFFICIENT_ROLE, 404 COMMUNITY_NOT_FOUND.

### GET /api/communities/:id/invitations

Auth: si. MODERADOR o mas.
Todas las invitaciones de la comunidad, mas nuevas primero.
200: { "items": [Invitacion] }

### DELETE /api/communities/:id/invitations/:idInvitacion

Auth: si. MODERADOR o mas.
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
Solo los canales donde tiene VER, ordenados por posicion y despues por id.
200: { "items": [Canal] }

### POST /api/communities/:id/channels

Auth: si. ADMIN o mas.
Body: { "nombre": "anuncios", "tipo": "TEXTO", "privado": false }
privado es opcional (false por defecto). El canal se agrega al final.
201: { "canal": Canal }
Socket: channel:created a cada integrante con VER (con su misPermisos).
Errores: 400 VALIDATION_ERROR, 403 INSUFFICIENT_ROLE, 404 COMMUNITY_NOT_FOUND.

### GET /api/channels/:id

Auth: si. VER.
200: { "canal": Canal }
Errores: 404 CHANNEL_NOT_FOUND si no existe o no tiene VER.

### PATCH /api/channels/:id

Auth: si. ADMIN o mas.
Body (al menos uno): { "nombre": "avisos", "tipo": "VOZ", "privado": true }
200: { "canal": Canal }
Socket: channel:updated a quienes tienen VER y channel:access-lost a quienes lo perdieron.
Errores:

- 400 VALIDATION_ERROR.
- 403 INSUFFICIENT_ROLE.
- 404 CHANNEL_NOT_FOUND.
- 409 CHANNEL_HAS_MESSAGES: pasar de TEXTO a VOZ o VIDEO con mensajes guardados.

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

Auth: si. ADMIN o mas.
Reemplaza toda la configuracion de acceso del canal.
Body:

```json
{
  "privado": true,
  "habilitaciones": [
    { "rol": "INTEGRANTE", "permisos": ["VER"] },
    { "idUsuario": 7, "permisos": ["VER", "ESCRIBIR"] }
  ]
}
```

En el body los usuarios van con idUsuario; en la respuesta vuelven como usuario (UsuarioPublico).
200: { "acceso": ConfiguracionAcceso }
Socket: igual que PATCH (channel:updated y channel:access-lost).
Errores:

- 400 VALIDATION_ERROR: permisos o roles invalidos, o repetidos.
- 403 INSUFFICIENT_ROLE.
- 404 CHANNEL_NOT_FOUND.
- 404 MEMBER_NOT_FOUND: algun idUsuario no es integrante.

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
- El autor (con ESCRIBIR) o un moderador (MODERADOR o mas con VER, y el autor con rol menor). Emite channel-message:deleted.
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

Al reemplazar el acceso o cambiar privacidad, el servidor retira de `channel:id` las pestañas que pierden VER y envía `channel:access-lost` a `user:id`. El frontend retira el canal de la lista y vuelve al catálogo de canales si lo tenía seleccionado. Quienes ganan o conservan VER reciben `channel:updated` con permisos propios; recuperar acceso permite resuscribirse, sin unión automática.

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
- CHANNEL_HAS_MESSAGES (409): channels.
- INVALID_ORDER (400): channels.
- CHANNEL_NOT_TEXT (400): historial y mensajes de canal.
- NO_WRITE_PERMISSION (403): mensajes de canal (socket).
- NO_CHANNEL_PERMISSION (403) y CANNOT_MODERATE_CHANNEL (403): helpers de autorización; no implican una ruta de llamadas/moderación adicional.
- CANNOT_DELETE_MESSAGE (403): mensajes de canal (socket).
- Se reusan MESSAGE_NOT_FOUND, NOT_AUTHOR y MESSAGE_DELETED.


### Autorizacion compartida y configuracion de acceso (T-23)

GET/PUT /api/channels/:id/access exige ADMIN o PROPIETARIO. PUT reemplaza
privado y todas las habilitaciones dentro de una transaccion; ambos campos son
obligatorios. Valida antes de escribir que los usuarios pertenezcan a la misma
comunidad. No acepta campos extras, roles superiores, targets duplicados ni
permisos repetidos. VER se agrega al guardar cualquier permiso, aunque luego
al calcular los efectivos se descarten los que no aplican al tipo actual.
Las respuestas de acceso muestran solo UsuarioPublico, sin correo ni credenciales.
Las habilitaciones nunca se incluyen en el DTO normal ni en channel:updated.

channelsService exporta:

- requireChannelPermission(idCanal, idUsuario, permiso = 'VER', db = prisma):
  devuelve { canal, rol, permisos } con la membresia y habilitaciones actuales.
  Sin VER arroja 404 CHANNEL_NOT_FOUND; con VER pero sin ESCRIBIR arroja
  403 NO_WRITE_PERMISSION. Para HABLAR/TRANSMITIR usa 403 NO_CHANNEL_PERMISSION.
- requireChannelModerator(idCanal, idUsuario, db = prisma): exige VER y
  MODERADOR o superior; no convierte una habilitacion individual en rol.
  Sin capacidad de moderar arroja 403 CANNOT_MODERATE_CHANNEL.
  La eliminación de T-26 comprueba además autoría y jerarquía del autor; este helper por sí solo no autoriza eliminar cualquier mensaje.
- withChannelPermission(idCanal, idUsuario, permiso, operation, afterCommit?): adquiere el
  bloqueo compartido y revalida dentro de la transaccion. operation(tx, context)
  debe usar tx. Se usa en suscripción, historial y escrituras de mensajes.

Las rutas existentes de detalle/listado y la suscripcion comparten el mismo
calculo efectivo. Los handlers channel:subscribe/unsubscribe esperan la union
inicial a rooms y revalidan la sesion en cada operacion. Una suscripcion no
concede ESCRIBIR ni moderacion. Salir es idempotente aunque ya no exista el canal.

Reemplazar acceso envia channel:updated personalizado a quienes conservan o
ganan VER. Quienes lo pierden salen de todas las rooms del canal y reciben
channel:access-lost. Si solo pierden ESCRIBIR conservan la room pero reciben
sus permisos actualizados. Recuperar VER permite resuscribirse sin reconectar;
no une automaticamente ninguna pestana. Los mensajes revalidan
permiso/sesión en cada operación y entrega; la pertenencia a una room no es autorizacion.

Los endpoints de cambio de rol/expulsion pertenecen a F-09 y aun no existen.
Cuando se agreguen deben compartir el bloqueo y recalcular audiencias, retirando
las rooms correspondientes. No hay migraciones ni dependencias nuevas en T-23.


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
El autor requiere ESCRIBIR. Otra persona necesita MODERADOR o superior, VER y
jerarquia estrictamente mayor que el rol actual del autor. No se permite borrar
a un par ni superior. Un autor que abandono tiene jerarquia 0 en esa comunidad.
Una habilitacion individual de VER/ESCRIBIR no concede moderacion.

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
