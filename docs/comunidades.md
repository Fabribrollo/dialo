# Contrato de comunidades y canales - Dialo (Entrega 50%)

Version 1. Borrador para revisar entre los tres (T-13).
Cubre F-05 (comunidades), F-06 (invitaciones e integrantes), F-07 (canales y acceso) y F-08 (mensajes en canales).
Usa las mismas convenciones que api.md y sockets.md: rutas bajo /api, camelCase, mismo formato de error, paginacion por cursor, Auth: si responde 401 UNAUTHORIZED.
El chat privado (conversations y eventos message:\*) no cambia.

---

## Decisiones

- Tipos de comunidad: PUBLICA y PRIVADA.
- Roles base: PROPIETARIO, ADMIN, MODERADOR, INTEGRANTE. Uno por integrante. Los roles personalizados quedan para F-09.
- Hay un solo propietario por comunidad. No puede abandonarla: primero transfiere la propiedad o la elimina.
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

PUBLICA:

- Aparece en el explorador (GET /api/communities/explore).
- Cualquier usuario puede ver su vista previa.
- Se puede ingresar directo (POST /api/communities/:id/join) o con invitacion.
- Si un no integrante pide GET /api/communities/:id recibe 403 NOT_MEMBER.

PRIVADA:

- No aparece en el explorador.
- Solo se puede ver la vista previa con una invitacion valida.
- Solo se ingresa con invitacion.
- Si un no integrante pide GET /api/communities/:id recibe 404 COMMUNITY_NOT_FOUND.

Pasar de PUBLICA a PRIVADA no expulsa a nadie.

---

## Roles de comunidad

Jerarquia: PROPIETARIO (4) > ADMIN (3) > MODERADOR (2) > INTEGRANTE (1).

Que puede hacer cada rol (cada rol puede todo lo de los roles menores):

- INTEGRANTE: ver la comunidad, sus integrantes y los canales a los que tiene acceso. Abandonar la comunidad.
- MODERADOR: crear, listar y revocar invitaciones. Eliminar mensajes ajenos en canales donde tiene VER.
- ADMIN: editar nombre, imagen y tipo de la comunidad. Crear, editar, ordenar y eliminar canales y configurar su acceso. Cambiar roles (solo a MODERADOR o INTEGRANTE).
- PROPIETARIO: transferir la propiedad, eliminar la comunidad, asignar ADMIN. No puede abandonar.

Regla de jerarquia (se aplica igual en HTTP y en sockets):

- Nadie puede actuar sobre alguien con rol igual o mayor al suyo (cambiarle el rol o eliminarle mensajes).
- Nadie puede asignar un rol igual o mayor al propio, salvo el propietario, que puede asignar ADMIN.
- El rol PROPIETARIO no se asigna con PATCH, solo con la transferencia.

---

## Permisos de canal

- VER (todos los tipos): ver el canal, abrirlo, leer el historial y recibir sus eventos.
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
- El enlace que arma el front es CLIENT_URL/invitacion/codigo.

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

- nombre de comunidad: 2 a 64 caracteres, sin espacios al inicio ni al final.
- tipo de comunidad: PUBLICA o PRIVADA.
- imagen de comunidad: jpg, png o webp, hasta 2 MB.
- nombre de canal: 1 a 32 caracteres, sin espacios al inicio ni al final.
- tipo de canal: TEXTO, VOZ o VIDEO.
- privado: booleano.
- rol asignable: ADMIN, MODERADOR o INTEGRANTE.
- permisos: lista sin repetidos de VER, ESCRIBIR, HABLAR, TRANSMITIR.
- habilitaciones: hasta 50, sin repetir rol ni usuario.
- duracionHoras (invitacion): 1, 24, 168 o null (sin vencimiento).
- usosMaximos (invitacion): 1 a 100, o null (sin limite).
- orden: todos los ids de canales de la comunidad, sin repetidos.
- contenido (mensaje de canal): 1 a 2000 caracteres despues de quitar espacios.
- q (explorador): 2 a 32 caracteres.
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
En una transaccion crea la comunidad, la membresia PROPIETARIO del usuario y el canal "general" (TEXTO, publico). El propietario sale de la sesion: el body no acepta idPropietario. La imagen se sube despues.
201: { "comunidad": Comunidad }
Socket: community:new a user:id propio, y une sus sockets a community:id.
Errores: 400 VALIDATION_ERROR.

### GET /api/communities/explore?q=lect&limit=20

Auth: si.
Busca comunidades PUBLICA por nombre (contiene, sin distinguir mayusculas).
200: { "items": [ComunidadPreview] }

### GET /api/communities/:id

Auth: si. Integrante.
200: { "comunidad": Comunidad }
Errores:

- 404 COMMUNITY_NOT_FOUND: no existe, o es privada y no es integrante.
- 403 NOT_MEMBER: es publica y no es integrante.

### GET /api/communities/:id/preview

Auth: si. Solo comunidades PUBLICA.
200: { "comunidad": ComunidadPreview }
Errores: 404 COMMUNITY_NOT_FOUND si no existe o es privada.

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

### POST /api/communities/:id/transfer

Auth: si. PROPIETARIO.
Body: { "idUsuario": 7 }
En una transaccion el destino pasa a PROPIETARIO y el propietario anterior a ADMIN.
200: { "comunidad": Comunidad }
Socket: community:updated y community:member-updated (dos veces) a community:id.
Errores:

- 400 SELF_TRANSFER: es el propio usuario.
- 403 INSUFFICIENT_ROLE: no es el propietario.
- 404 MEMBER_NOT_FOUND: el destino no es integrante.

---

## 6. Ingreso e integrantes (F-06)

### POST /api/communities/:id/join

Auth: si. Solo comunidades PUBLICA.
Ingresa con rol INTEGRANTE. Si ya era integrante no cambia nada.
201 si ingreso, 200 si ya era integrante: { "comunidad": Comunidad }
Socket (si ingreso): community:member-joined a community:id y community:new a user:id propio. Une sus sockets a community:id.
Errores: 404 COMMUNITY_NOT_FOUND si no existe o es privada.

### POST /api/communities/:id/leave

Auth: si. Integrante. 204.
Socket: community:member-left a community:id y community:left a user:id propio. Saca sus sockets de community:id y de sus canales.
Errores:

- 409 OWNER_CANNOT_LEAVE: es el propietario.
- 404 COMMUNITY_NOT_FOUND.

### GET /api/communities/:id/members

Auth: si. Integrante.
Ordenados por rol (mayor primero) y despues por nombreVisible.
200: { "items": [Integrante] }

### PATCH /api/communities/:id/members/:idUsuario

Auth: si. ADMIN o mas, respetando la regla de jerarquia.
Body: { "rol": "MODERADOR" }
200: { "integrante": Integrante }
Socket: community:member-updated a community:id, y se recalcula el acceso del afectado a los canales.
Errores:

- 400 VALIDATION_ERROR: rol invalido (incluido PROPIETARIO).
- 403 INSUFFICIENT_ROLE.
- 403 CANNOT_MANAGE_MEMBER: el destino tiene rol igual o mayor, o el rol pedido es igual o mayor al propio.
- 404 MEMBER_NOT_FOUND.

---

## 7. Invitaciones (F-06)

### POST /api/communities/:id/invitations

Auth: si. MODERADOR o mas.
Body (opcional): { "duracionHoras": 24, "usosMaximos": 10 }
201: { "invitacion": Invitacion }
Errores: 400 VALIDATION_ERROR, 403 INSUFFICIENT_ROLE, 404 COMMUNITY_NOT_FOUND.

### GET /api/communities/:id/invitations

Auth: si. MODERADOR o mas.
Todas las invitaciones de la comunidad, mas nuevas primero.
200: { "items": [Invitacion] }

### DELETE /api/communities/:id/invitations/:idInvitacion

Auth: si. MODERADOR o mas.
Revoca la invitacion (queda guardada con estado REVOCADA). Repetirlo tambien responde 204. 204.
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
Ingresa con rol INTEGRANTE y suma un uso, en una transaccion. Si ya era integrante no consume un uso. Dos aceptaciones al mismo tiempo no pueden pasar el maximo de usos.
201 si ingreso, 200 si ya era integrante: { "comunidad": Comunidad }
Socket (si ingreso): igual que join.
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
- 400 VALIDATION_ERROR: parametros invalidos o cursor de otro canal.

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
- Errores: CHANNEL_NOT_FOUND.

channel:unsubscribe

- Payload: { "idCanal": 21 }
- Ack ok: { "ok": true, "data": {} }

channel-message:send

- Payload: { "idCanal": 21, "contenido": "Hola" }
- Requiere ESCRIBIR. Guarda el mensaje y emite channel-message:new a channel:id.
- Ack ok: { "ok": true, "data": { "mensaje": MensajeCanal } }
- Errores: VALIDATION_ERROR, CHANNEL_NOT_FOUND, NO_WRITE_PERMISSION.

channel-message:edit

- Payload: { "idMensaje": 340, "contenido": "Hola (editado)" }
- Solo el autor, y necesita ESCRIBIR. Emite channel-message:updated.
- Errores: VALIDATION_ERROR, MESSAGE_NOT_FOUND, NOT_AUTHOR, MESSAGE_DELETED, NO_WRITE_PERMISSION.

channel-message:delete

- Payload: { "idMensaje": 340 }
- El autor (con ESCRIBIR) o un moderador (MODERADOR o mas con VER, y el autor con rol menor). Emite channel-message:deleted.
- Errores: MESSAGE_NOT_FOUND, MESSAGE_DELETED, CANNOT_DELETE_MESSAGE.

### Servidor a cliente

Comunidades:

- community:new a user:id. Payload { "comunidad": Comunidad }. Se creo o se ingreso a una comunidad.
- community:updated a community:id. Payload { "comunidad": Comunidad }. El front conserva su propio miRol.
- community:deleted a community:id. Payload { "idComunidad": 4 }.
- community:left a user:id. Payload { "idComunidad": 4 }. Para las otras pestanas de quien abandono.
- community:member-joined a community:id. Payload { "idComunidad": 4, "integrante": Integrante }.
- community:member-left a community:id. Payload { "idComunidad": 4, "idUsuario": 7 }.
- community:member-updated a community:id. Payload { "idComunidad": 4, "integrante": Integrante }.

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

Cuando un usuario pierde VER en un canal (cambia la configuracion, le cambian el rol, abandona o se borra la comunidad):

1. El servidor saca sus sockets de channel:id en ese momento, sin esperar que se reconecte.
2. Le emite channel:access-lost a user:id.
3. El front saca el canal de la lista y, si lo tenia abierto, lo cierra y vuelve a la comunidad.

Si recupera VER, recibe channel:updated y puede volver a suscribirse.
Toda operacion (HTTP o socket) vuelve a revisar los permisos actuales en la base, no los del momento de la suscripcion.

### Constantes nuevas para events.js (back y front)

```js
COMMUNITY_NEW: 'community:new',
COMMUNITY_UPDATED: 'community:updated',
COMMUNITY_DELETED: 'community:deleted',
COMMUNITY_LEFT: 'community:left',
COMMUNITY_MEMBER_JOINED: 'community:member-joined',
COMMUNITY_MEMBER_LEFT: 'community:member-left',
COMMUNITY_MEMBER_UPDATED: 'community:member-updated',
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

- /comunidades: mis comunidades y el explorador.
- /comunidades/:id: la comunidad (lista de canales e integrantes).
- /comunidades/:id/canales/:idCanal: un canal abierto.
- /invitacion/:codigo: vista previa con Aceptar y Rechazar. Si no hay sesion, se guarda el codigo, se va al login y despues se vuelve aca.

Los canales de VOZ y VIDEO se muestran con un aviso de que las llamadas todavia no estan disponibles.

---

## Funciones compartidas

Para no repetir las reglas de permisos en cada feature.

- getMembership(idComunidad, idUsuario): devuelve { rol } o null. En services/communitiesService.js. Duenio: Fabri. La usan todos.
- requireRole(idComunidad, idUsuario, rolMinimo): tira 404 COMMUNITY_NOT_FOUND o 403 INSUFFICIENT_ROLE. En services/communitiesService.js. Duenio: Fabri.
- getChannelPermissions(idCanal, idUsuario): devuelve la lista de permisos efectivos (vacia si no es integrante). En services/channelsService.js. Duenio: Valentin. La usan Valentin (canales y mensajes) y el socket.
- emitToCommunity(idComunidad, evento, payload), joinCommunity(idComunidad, idsUsuarios), leaveCommunity(idComunidad, idUsuario): en sockets/emitter.js.
- emitToChannel(idCanal, evento, payload), leaveChannel(idCanal, idUsuario): en sockets/emitter.js.

---

## Errores nuevos

Nota de T-22: las notificaciones de eliminacion y orden se envian por usuario
para evitar difundir IDs de canales privados a quienes no tienen VER. Los
nombres de eventos y las formas del payload se mantienen. La orden enviada por
un administrador a PUT sigue incluyendo todos los canales de la comunidad.

### Estado de implementacion de canales tras T-22

Estan implementados listado, creacion, detalle, actualizacion, ordenamiento y
eliminacion. La evaluacion de permisos existente se reutiliza desde
getChannelPermissions(idCanal, idUsuario); devuelve [] si no existe o no hay
membresia. Configurar habilitaciones mediante GET/PUT /channels/:id/access
corresponde a T-23. La interfaz corresponde a T-24; suscripciones e historial y
mensajeria corresponden a T-25/T-26/T-27.

Las escrituras de canales adquieren FOR UPDATE sobre la comunidad dentro de una
transaccion. Esto coordina creacion, orden, modificacion y eliminacion entre
procesos. withCommunityChannelsLock(idComunidad, operation) queda disponible
para que T-23 y el envio de mensajes de T-26 compartan el mismo bloqueo y no
compitan con cambios de tipo o eliminaciones.

El cambio de TEXTO a VOZ/VIDEO se rechaza si existe cualquier mensaje, incluidos
los eliminados logicamente. Eliminar el canal aplica las cascadas del modelo.

requireRole admite un cuarto argumento db opcional para verificar permisos con
el cliente de una transaccion, conservando el comportamiento de los llamados
anteriores que no lo utilizan. No hay nueva migracion ni dependencia.

- COMMUNITY_NOT_FOUND (404): communities.
- NOT_MEMBER (403): communities.
- INSUFFICIENT_ROLE (403): communities, invitations, channels.
- CANNOT_MANAGE_MEMBER (403): members.
- MEMBER_NOT_FOUND (404): members, channels.
- OWNER_CANNOT_LEAVE (409): members.
- SELF_TRANSFER (400): communities.
- INVITATION_NOT_FOUND (404): invitations.
- INVITATION_EXPIRED (410): invitations.
- INVITATION_REVOKED (410): invitations.
- INVITATION_EXHAUSTED (410): invitations.
- CHANNEL_NOT_FOUND (404): channels.
- CHANNEL_HAS_MESSAGES (409): channels.
- INVALID_ORDER (400): channels.
- NO_WRITE_PERMISSION (403): mensajes de canal (socket).
- CANNOT_DELETE_MESSAGE (403): mensajes de canal (socket).
- Se reusan MESSAGE_NOT_FOUND, NOT_AUTHOR y MESSAGE_DELETED.
