# Contrato de API — Dialo

Contrato implementado en `main` hasta T-27. Mantener este archivo junto con rutas, validaciones y servicios cuando cambie el comportamiento. Las limitaciones pendientes se indican expresamente.

Eventos en tiempo real: ver [sockets.md](./sockets.md).

Comunidades, invitaciones, canales y mensajes de canal (Entrega 50%): ver [comunidades.md](./comunidades.md).

---

## Decisiones implementadas

| Tema | Decisión |
| --- | --- |
| Envío de mensajes | Por socket con ack (`message:send`, `message:edit`, `message:delete`). El historial se pide por HTTP. |
| Registro | Registrarse inicia sesión automáticamente (setea la cookie). |
| Login | Acepta nombre de usuario **o** correo en el mismo campo. |
| Solicitud rechazada | Se puede volver a enviar una nueva. Solo se bloquea si hay una pendiente. |
| Amistad eliminada | La conversación sigue visible (historial), pero no se pueden enviar mensajes nuevos. |
| Mensaje eliminado | Queda en la base; la API devuelve `contenido: null` y `eliminado: true`. |
| Reset de contraseña | Revoca todas las sesiones activas del usuario. |
| Autor de los mensajes | Los mensajes llevan solo `idAutor`; el front resuelve el usuario (es el propio o el `otroUsuario` de la conversación). |
| Usuario no participante | Responde 403 `NOT_PARTICIPANT`. |
| Fotos de perfil | Cloudinary, una por usuario (`dialo/avatars/usuario-<id>`). |
| Disponibilidad `INVISIBLE` | Solo el dueño la ve como `INVISIBLE`; a los demás se les devuelve `AUSENTE`. |
| Eventos a varias pestañas | Los eventos de amistades, conversaciones nuevas y perfil se emiten a las dos partes, así se actualizan también las otras pestañas de quien hizo la acción. |

---

## Convenciones globales

- Todas las rutas empiezan con `/api`.
- Request y response en JSON, salvo fotos/imágenes (`multipart/form-data`) y respuestas sin contenido.
- En ejemplos, cadenas como `"UsuarioPublico"` representan el objeto definido en Formas compartidas, no una cadena literal de la API.
- Ids numéricos. Fechas en ISO 8601 (`"2026-10-05T17:03:05.000Z"`).
- Nombres de campos en camelCase.
- Respuestas exitosas sin contenido: `204` sin body.

### Autenticación

- Sesión guardada en la tabla `sesion`. El token viaja en la cookie **`dialo_sid`**, `httpOnly`, con duración de 30 días. Las opciones están centralizadas en `config/cookies.js`:
  - Desarrollo: `sameSite: lax`, sin `secure`. Front y API comparten origen gracias al proxy de Vite.
  - Producción: `sameSite: none` + `secure`; requiere HTTPS. Estas opciones dependen de `NODE_ENV`, no de una detección automática de dominios.
- El front manda `credentials: 'include'` en cada request, y CORS acepta solo `CLIENT_URL` con `credentials: true`.
- La base guarda solo el hash del token.
- Rutas marcadas **Auth: sí** responden `401 UNAUTHORIZED` sin sesión válida (inexistente, vencida o revocada).

### `req.user`

El middleware real es `middlewares/authenticate.js`. Usa `findAuthUserBySessionToken` para la cookie o `findAuthUserById` para el acceso de desarrollo y deja esta forma:

```js
req.user = { id: 1, nombreUsuario: "ana", nombreVisible: "Ana" }
```

En desarrollo, `authenticate` toma el ID del header `x-dev-user-id` y busca ese usuario en la base. El socket tiene su equivalente: el handshake acepta `auth: { devUserId }` (ver [sockets.md](./sockets.md#conexión)). Los dos se desactivan cuando `NODE_ENV` es `production`.

### Formato de error

Todas las respuestas de error tienen esta forma:

```json
{
  "error": {
    "code": "REQUEST_EXISTS",
    "message": "Ya hay una solicitud pendiente entre ustedes"
  }
}
```

- `code`: lo que lee el front para decidir qué hacer. Estable, en inglés, MAYÚSCULAS.
- `message`: texto para mostrar al usuario, en español.
- `details`: opcional; las validaciones de campos incluyen una entrada por campo inválido: `{ "campo": "correo", "message": "Correo inválido" }`.

### Conflictos de la base

Si una restricción única de la base frena un insert (por ejemplo, dos solicitudes simultáneas), el `errorHandler` responde `409` con el código de la tabla: `REQUEST_EXISTS`, `ALREADY_FRIENDS`, `USERNAME_TAKEN`, `EMAIL_TAKEN`, `CONVERSATION_EXISTS` o `CONFLICT` si no hay uno específico. Los services igual validan antes, para devolver el error sin depender de la base.

### Paginación

Los historiales de mensajes se paginan por cursor. Su respuesta trae `nextCursor`; si es `null`, no hay más. Los listados de amigos, solicitudes y conversaciones no tienen cursor; búsqueda de usuarios usa `limit` sin cursor.

```json
{ "items": [], "nextCursor": 120 }
```

---

## Formas compartidas

### UsuarioPublico

Lo que se puede mostrar de cualquier usuario. Nunca incluye hash, correo ni datos de sesión.

```json
{
  "id": 2,
  "nombreUsuario": "beto",
  "nombreVisible": "Beto",
  "fotoUrl": null,
  "informacionPersonal": "Me gusta el mate",
  "disponibilidad": "EN_LINEA"
}
```

`disponibilidad`: `EN_LINEA` | `AUSENTE` | `NO_MOLESTAR`. Si el usuario eligió `INVISIBLE`, en `UsuarioPublico` se devuelve `AUSENTE`.

### UsuarioPropio

`UsuarioPublico` + datos que solo ve el dueño de la cuenta.

```json
{ "...UsuarioPublico": "", "correo": "ana@mail.com", "fechaCreacion": "2026-10-05T17:03:05.000Z" }
```

En `UsuarioPropio`, `disponibilidad` puede ser también `INVISIBLE`.

### Solicitud

```json
{
  "id": 7,
  "emisor": "UsuarioPublico",
  "receptor": "UsuarioPublico",
  "estado": "PENDIENTE",
  "fechaCreacion": "2026-10-05T17:03:05.000Z"
}
```

### Amigo

```json
{ "usuario": "UsuarioPublico", "desde": "2026-10-05T17:03:05.000Z" }
```

### Conversacion

```json
{
  "id": 3,
  "otroUsuario": "UsuarioPublico",
  "ultimoMensaje": "Mensaje | null",
  "puedeEscribir": true,
  "fechaCreacion": "2026-10-05T17:03:05.000Z"
}
```

`puedeEscribir` es `false` si ya no son amigos.

### Mensaje

```json
{
  "id": 120,
  "idConversacion": 3,
  "idAutor": 1,
  "contenido": "Hola!",
  "fechaCreacion": "2026-10-05T17:03:05.000Z",
  "fechaEdicion": null,
  "eliminado": false
}
```

Si `eliminado` es `true`, `contenido` es `null`.

---

## Reglas de validación

| Campo | Regla |
| --- | --- |
| `nombreUsuario` | 3 a 32 caracteres, solo minúsculas, números, `_` y `.` |
| `correo` | email válido, hasta 254 caracteres, se guarda en minúsculas |
| `contrasena` | 8 a 72 caracteres |
| `nombreVisible` | se recortan los extremos y se validan 1 a 64 caracteres |
| `informacionPersonal` | hasta 500 caracteres, puede ser `null` |
| `contenido` (mensaje) | 1 a 2000 caracteres después de recortar los extremos; conserva espacios internos |
| `q` (búsqueda) | 2 a 32 caracteres |
| `limit` | 1 a 50 |

---

## Estado de la API

### GET /api/health

Auth: no. Devuelve `200` con `{ "status": "ok" }`. Comprueba que Express responde; no realiza una consulta de salud a PostgreSQL.

## 1. Cuenta y acceso — `auth`

### POST /api/auth/register

Auth: no

Body:
```json
{ "nombreUsuario": "ana", "correo": "ana@mail.com", "contrasena": "12345678", "nombreVisible": "Ana" }
```

`201` + cookie `dialo_sid`:
```json
{ "usuario": "UsuarioPropio" }
```

Errores:
| Status | code | Cuándo |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | algún campo no cumple las reglas |
| 409 | `USERNAME_TAKEN` | el nombre de usuario ya existe |
| 409 | `EMAIL_TAKEN` | el correo ya existe |

### POST /api/auth/login

Auth: no

Body:
```json
{ "identificador": "ana", "contrasena": "12345678" }
```

`identificador` acepta nombre de usuario o correo.

`200` + cookie `dialo_sid`:
```json
{ "usuario": "UsuarioPropio" }
```

Errores:
| Status | code | Cuándo |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | faltan campos |
| 401 | `INVALID_CREDENTIALS` | usuario inexistente o contraseña incorrecta (mismo error para los dos) |

### POST /api/auth/logout

Auth: sí

Completa `fecha_revocacion` de la sesión actual y borra la cookie. La desconexión proactiva de todos sus sockets sigue pendiente en T-15; no confundir revocación en base con retiro inmediato de otras pestañas.

`204`

### POST /api/auth/forgot-password

Auth: no

Body:
```json
{ "correo": "ana@mail.com" }
```

Para una solicitud válida y sin fallas internas, devuelve `202` sin body exista o no el correo, para no revelar cuentas. Si existe, crea un registro en `recuperacion_cuenta` (vence en 1 hora) e intenta enviar `CLIENT_URL/reset-password?token=...`. Sin `RESEND_API_KEY` no se envía correo; en desarrollo se registra el enlace en la consola. Los fallos del proveedor se registran sin convertir la respuesta en una confirmación de entrega.

Errores:
| Status | code | Cuándo |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | correo con formato inválido |

### POST /api/auth/reset-password

Auth: no

Body:
```json
{ "token": "abc123...", "contrasena": "nueva-clave" }
```

Cambia la contraseña, marca el token como usado y revoca todas las sesiones del usuario en la base. La desconexión global inmediata de sockets y el vencimiento proactivo son parte de T-15.

`204`

Errores:
| Status | code | Cuándo |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | contraseña no cumple las reglas |
| 400 | `INVALID_TOKEN` | token inexistente, vencido o ya usado |

---

## 2. Perfil — `users`

### GET /api/users/me

Auth: sí

`200`:
```json
{ "usuario": "UsuarioPropio" }
```

### PATCH /api/users/me

Auth: sí

Body (todos opcionales, al menos uno):
```json
{ "nombreVisible": "Ana G.", "informacionPersonal": "...", "disponibilidad": "AUSENTE" }
```

`200`:
```json
{ "usuario": "UsuarioPropio" }
```

Socket: emite `user:updated` a `user:<id>` de cada amigo y a `user:<id>` propio.

Errores:
| Status | code | Cuándo |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | campo inválido o body vacío |

### POST /api/users/me/foto

Auth: sí

Body: `multipart/form-data` con el campo `foto` (jpg, png o webp, hasta 2 MB).

`200`:
```json
{ "usuario": "UsuarioPropio" }
```

Socket: emite `user:updated` a `user:<id>` de cada amigo y a `user:<id>` propio.

Errores:
| Status | code | Cuándo |
| --- | --- | --- |
| 400 | `INVALID_FILE` | falta el archivo, tipo no permitido o supera 2 MB |

La foto se sube a Cloudinary (`utils/storage.js`), recortada a 256×256 en WebP, y `fotoUrl` guarda la URL pública que devuelve. Cada usuario tiene una sola foto: subir otra reemplaza la anterior.

### GET /api/users/:id

Auth: sí

`200`:
```json
{ "usuario": "UsuarioPublico" }
```

Errores:
| Status | code | Cuándo |
| --- | --- | --- |
| 404 | `USER_NOT_FOUND` | no existe |

---

## 3. Amigos y usuarios — `friends`

### GET /api/users/search?q=be&limit=20

Auth: sí

Busca por `nombreUsuario` o `nombreVisible` (contiene, sin distinguir mayúsculas). Excluye al usuario actual.

`200`:
```json
{
  "items": [
    { "usuario": "UsuarioPublico", "relacion": "NINGUNA" }
  ]
}
```

`relacion`: `NINGUNA` | `AMIGOS` | `SOLICITUD_ENVIADA` | `SOLICITUD_RECIBIDA`. Sirve para que el botón del buscador muestre "Agregar", "Amigos", "Pendiente" o "Responder".

Errores:
| Status | code | Cuándo |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `q` muy corto o muy largo |

### GET /api/friends

Auth: sí

`200`, ordenados por `nombreVisible`:
```json
{ "items": ["Amigo"] }
```

### DELETE /api/friends/:idUsuario

Auth: sí

Elimina la amistad. La conversación queda con `puedeEscribir: false`.

`204`

Socket: emite `friend:removed` a `user:<idUsuario>` y a `user:<id>` propio.

Errores:
| Status | code | Cuándo |
| --- | --- | --- |
| 404 | `FRIENDSHIP_NOT_FOUND` | no son amigos |

### GET /api/friends/requests?tipo=recibidas

Auth: sí

`tipo`: `recibidas` | `enviadas`. Solo devuelve las pendientes, más nuevas primero.

`200`:
```json
{ "items": ["Solicitud"] }
```

Errores:
| Status | code | Cuándo |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `tipo` falta o es inválido |

### POST /api/friends/requests

Auth: sí

Body:
```json
{ "idReceptor": 2 }
```

`201`:
```json
{ "solicitud": "Solicitud" }
```

Socket: emite `friend:request` a `user:<idReceptor>` y a `user:<id>` propio.

Errores:
| Status | code | Cuándo |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `idReceptor` falta o no es número |
| 400 | `SELF_REQUEST` | `idReceptor` es el propio usuario |
| 404 | `USER_NOT_FOUND` | el receptor no existe |
| 409 | `ALREADY_FRIENDS` | ya son amigos |
| 409 | `REQUEST_EXISTS` | ya hay una pendiente entre los dos, en cualquier dirección |

### POST /api/friends/requests/:id/accept

Auth: sí

En una transacción: marca la solicitud como `ACEPTADA`, completa `fecha_respuesta` y crea la fila de `amistad` con el par ordenado.

`200`:
```json
{ "amigo": "Amigo" }
```

Socket: emite `friend:accepted` a `user:<idEmisor>` y a `user:<id>` propio.

Errores:
| Status | code | Cuándo |
| --- | --- | --- |
| 404 | `REQUEST_NOT_FOUND` | no existe |
| 403 | `NOT_RECEIVER` | el usuario actual no es el receptor |
| 409 | `REQUEST_NOT_PENDING` | ya fue aceptada o rechazada |

### POST /api/friends/requests/:id/reject

Auth: sí

Marca la solicitud como `RECHAZADA` y completa `fecha_respuesta`.

`204`

Socket: emite `friend:rejected` a `user:<idEmisor>` y a `user:<id>` propio.

Errores: los mismos que `accept`.

---

## 4. Conversaciones privadas — `conversations`

### GET /api/conversations

Auth: sí

Conversaciones del usuario, ordenadas por actividad (último mensaje o creación, más reciente primero).

`200`:
```json
{ "items": ["Conversacion"] }
```

### POST /api/conversations

Auth: sí

Obtiene la conversación con ese usuario o la crea si no existe.

Body:
```json
{ "idUsuario": 2 }
```

`200` si ya existía, `201` si se creó:
```json
{ "conversacion": "Conversacion" }
```

Socket: si se creó, une los sockets de los dos a `conversation:<id>` y emite `conversation:new` a `user:<idUsuario>` y a `user:<id>` propio.

Errores:
| Status | code | Cuándo |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `idUsuario` falta o no es número |
| 400 | `SELF_CONVERSATION` | `idUsuario` es el propio usuario |
| 403 | `NOT_FRIENDS` | no son amigos |

### GET /api/conversations/:id

Auth: sí

`200`:
```json
{ "conversacion": "Conversacion" }
```

Errores:
| Status | code | Cuándo |
| --- | --- | --- |
| 404 | `CONVERSATION_NOT_FOUND` | no existe |
| 403 | `NOT_PARTICIPANT` | el usuario actual no participa |

### GET /api/conversations/:id/messages?cursor=120&limit=30

Auth: sí

Historial paginado, **más nuevos primero**. `cursor` es el `id` del mensaje más viejo que ya tiene el front; sin `cursor`, trae los últimos. El front invierte el orden para mostrarlos.

`limit` vale 30 por defecto y admite de 1 a 50. Se ordena por `fechaCreacion` descendente y, ante fechas iguales, por `id` descendente. El cursor debe existir y pertenecer a esta conversación. Los mensajes eliminados siguen formando parte del historial con `contenido: null` y `eliminado: true`. `nextCursor` es `null` cuando no quedan mensajes anteriores.

`200`:
```json
{ "items": ["Mensaje"], "nextCursor": 91 }
```

Errores:
| Status | code | Cuándo |
| --- | --- | --- |
| 404 | `CONVERSATION_NOT_FOUND` | no existe |
| 403 | `NOT_PARTICIPANT` | el usuario actual no participa |
| 400 | `VALIDATION_ERROR` | parámetros inválidos o cursor inexistente/de otra conversación |

Enviar, editar y eliminar mensajes: por socket, ver [sockets.md](./sockets.md).

---

## Funciones compartidas entre features

Estas funciones ya tienen implementación y se reutilizan entre los servicios.

| Función | Ubicación (bajo `apps/backend/src/`) | Devuelve/uso |
| --- | --- | --- |
| `areFriends(idA, idB)` | `services/friendsService.js` | `Promise<boolean>`; autoriza creación/envío privado |
| `getFriendIds(idUsuario)` | `services/friendsService.js` | `Promise<number[]>`; destinatarios de perfil y listado privado |
| `emitToUser(idUsuario, evento, payload)` | `sockets/emitter.js` | Emite a la room personal |
| `emitToConversation(idConversacion, evento, payload)` | `sockets/emitter.js` | Emite a los participantes conectados |
| `joinConversation(idConversacion, idsUsuarios)` | `sockets/emitter.js` | Une sockets existentes a una conversación |
| `usuarioPublicoSelect`, `toUsuarioPublico(usuario)` | `utils/selects.js` | Selección/mapeo público; oculta `INVISIBLE` |
| `AppError(status, code, message, details?)` | `utils/AppError.js` | Error con estado y código público |

---

## Catálogo de códigos de error

| code | Status | Feature |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | todas |
| `UNAUTHORIZED` | 401 | todas |
| `NOT_FOUND` | 404 | ruta o recurso inexistente |
| `CONFLICT` | 409 | todas (restricción única sin código propio) |
| `PAYLOAD_TOO_LARGE` | 413 | todas |
| `INTERNAL_ERROR` | 500 | todas |
| `USERNAME_TAKEN` | 409 | auth |
| `EMAIL_TAKEN` | 409 | auth |
| `INVALID_CREDENTIALS` | 401 | auth |
| `INVALID_TOKEN` | 400 | auth |
| `INVALID_FILE` | 400 | users, imagen de comunidad |
| `USER_NOT_FOUND` | 404 | users, friends |
| `SELF_REQUEST` | 400 | friends |
| `ALREADY_FRIENDS` | 409 | friends |
| `REQUEST_EXISTS` | 409 | friends |
| `REQUEST_NOT_FOUND` | 404 | friends |
| `NOT_RECEIVER` | 403 | friends |
| `REQUEST_NOT_PENDING` | 409 | friends |
| `FRIENDSHIP_NOT_FOUND` | 404 | friends |
| `NOT_FRIENDS` | 403 | conversations |
| `SELF_CONVERSATION` | 400 | conversations |
| `CONVERSATION_EXISTS` | 409 | traducción de una restricción única de conversación; la creación normal concurrente reutiliza el par con `skipDuplicates` |
| `CONVERSATION_NOT_FOUND` | 404 | conversations |
| `NOT_PARTICIPANT` | 403 | conversations |
| `MESSAGE_NOT_FOUND` | 404 | conversations (socket) |
| `NOT_AUTHOR` | 403 | conversations (socket) |
| `MESSAGE_DELETED` | 409 | conversations (socket) |
