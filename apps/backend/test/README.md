# Pruebas del backend

Las suites verifican la API y Socket.IO con Prisma y sesiones reales. Las pruebas puras de permisos no usan base. No existe un script `npm test` general del backend: ejecutar los comandos de esta guía desde la raíz del repositorio.

## Preparación

Instalar según el [README principal](../../../README.md) y generar Prisma Client:

```sh
npm ci
npm run db:generate -w apps/backend
```

Para integración, configurar **`TEST_DATABASE_URL` exclusiva de pruebas**, con conexión directa PostgreSQL y permiso para crear/eliminar schemas. No usar la base compartida del equipo ni producción. Las suites toman esta variable explícita, no la conexión de desarrollo del `.env`, y configuran internamente su entorno y sesiones.

Cada suite crea un schema aleatorio, aplica el SQL de todas las migraciones de `prisma/migrations` en orden mediante `migrations.js`, prepara fixtures y elimina solo ese schema al terminar. Una interrupción abrupta puede dejarlo pendiente de limpieza. No es necesario ejecutar seed ni migrar la base de desarrollo para estas suites.

| Suite | Comando (`npm run … -w apps/backend`) | Casos actuales | Schema temporal |
| --- | --- | --- | --- |
| Conversaciones privadas T-10 | `test:conversations` | 18 | `test_t10_*` |
| Mensajería privada T-11 | `test:messages` | 20 | `test_t11_*` |
| Comunidades/invitaciones T-16/T-17/T-19/T-20 | `test:communities` | 19 | `test_f05_*` |
| Canales T-22 | `test:channels` | 17 | `test_t22_*` |
| Permisos/suscripciones T-23 | `test:channel-access` | 4 puros + 14 de integración | `test_t23_*` en integración |
| Historial de canales T-25 | `test:channel-messages` | 19 | `test_t25_*` |
| Mensajería de canales T-26 | `test:channel-realtime` | 25 | `test_t26_*` |

Estos conteos describen la versión actual, no un reporte de una ejecución nueva. T-10, T-11 y comunidades fuerzan una conexión; T-22, T-23, T-25 y T-26 usan cinco salvo `connection_limit` explícito en la URL. Para acreditar bloqueos/concurrencia entre conexiones, ejecutar las suites correspondientes contra PostgreSQL nativo con al menos cinco conexiones disponibles. PGlite de una conexión no acredita ese escenario.

## Ejecución completa de integración

Ejemplo PowerShell, reemplazando los valores por una base exclusiva:

```powershell
$env:TEST_DATABASE_URL = "postgresql://USUARIO:CONTRASENA@HOST/BASE_DE_PRUEBAS?sslmode=require"
npm run test:conversations -w apps/backend
npm run test:messages -w apps/backend
npm run test:communities -w apps/backend
npm run test:channels -w apps/backend
npm run test:channel-access -w apps/backend
npm run test:channel-messages -w apps/backend
npm run test:channel-realtime -w apps/backend
Remove-Item Env:TEST_DATABASE_URL
```

Ejecutar secuencialmente y revisar el resultado de cada comando: PowerShell puede continuar aunque uno falle. Una suite aprobada termina con código cero; no interpretar un fallo de conexión como validación funcional.

Solo pruebas puras, sin base ni instalación de otro binario Node:

```sh
node --test apps/backend/test/channel-permissions.test.js
```

## Cobertura por área

### Conversaciones privadas

T-10 comprueba las cuatro rutas HTTP: creación/reutilización con par ordenado, concurrencia del mismo par, validación de IDs/límites/cursores, conversación propia o sin amistad, acceso de terceros, listado por actividad y detalle personalizado. Verifica `conversation:new`, varias pestañas, rooms antes del evento, deduplicación al reutilizar, historial tras quitar amistad, disponibilidad invisible, contenido eliminado y paginación por fecha/ID.

T-11 agrega autenticación del handshake, sesiones falsas/vencidas/revocadas, rechazo de identidad de desarrollo en producción, primer evento y reconexión. Cubre envío, autoría, edición/eliminación propias, auditoría, redacción irreversible, validación, eventos a participantes/pestañas y rechazo de terceros. Comprueba pérdida de amistad, operaciones con sesión revocada, carreras de edición/eliminación y eventos sin callback. Su fixture de mensaje de canal crea un canal válido para respetar la FK del modelo.

Estas suites no acreditan la desconexión proactiva global pendiente en T-15. En privados se revalida la sesión al operar; la recepción de una sesión inactiva revocada sigue siendo parte de esa tarea.

### Comunidades e invitaciones

La suite comprueba creación atómica con propietario/canal general, listado y detalle por membresía, edición e imagen, eliminación y cascadas, permisos y DTO públicos. Cubre integrantes, abandono, eventos, invitaciones con usos/vencimiento/revocación, previa sin ingreso, aceptación y concurrencia sin superar usos. Los roles necesarios se preparan en fixtures: esto no acredita asignación por API ni transferencia. El CRUD del catálogo se valida por separado en T-29.

### Canales y acceso

T-22 cubre CRUD, tipos, roles, filtrado privado, defaults, DTO público, cambio de tipo con contenido, cascadas, posición estable, orden completo/concurrente y eventos en varias pestañas. Simula sockets ya unidos para verificar retiro al perder Ver o borrar el canal.

T-23 verifica la matriz efectiva y schemas estrictos, configuración completa, normalización, rechazo de escalamiento, roles/usuarios, membresías ajenas, solo lectura, voz/video, revocación/recuperación y varias pestañas. Incluye suscripción frente a cambios de acceso, abandono, borrado y sesión; no reutiliza la autorización del handshake como permiso permanente.

### Historial de canales

T-25 cubre IDs, cursores y límites, autorización/roles, canales de solo lectura, rechazo de voz/video, paginación con fechas empatadas o distintas del orden de IDs, separación entre canales/comunidades/privados, DTO de autores, Invisible, borrados/auditoría y autores que abandonaron. Verifica cursor eliminado, inserciones entre páginas, pérdida/recuperación de acceso, abandono, borrado y persistencia tras reiniciar HTTP. Sus mensajes se insertan como fixtures solo en el schema aislado.

### Mensajería y moderación de canales

T-26 comprueba identidad de sesión, payloads estrictos, persistencia, varias pestañas, una room sin autorización, solo lectura, tipos, edición propia y eliminación por jerarquía. Cubre auditoría y contenido eliminado, IDs ajenos, pérdida/recuperación de acceso, abandono, sesiones emisoras y receptoras vencidas/revocadas, sesión que vence esperando la cola, eliminación doble, carreras de edición/borrado y publicación/revocación/tipo, canal eliminado, eventos sin ack y reconexión.

La protección de receptores de T-26 ocurre al entregar mensajes de canal; no es un barrido global de sesiones ni sustituye T-15.

## Smoke tests contra el servidor en ejecución

Ejecutar con la app ya iniciada en otra terminal mediante `npm run dev`. Estos comandos **usan la base del backend en ejecución** y crean datos allí. No leen `TEST_DATABASE_URL`, no levantan una base aislada, no ejecutan seed ni migraciones y no requieren contraseñas de usuarios existentes.

El destino por defecto es `http://localhost:3000`; `DIALO_TEST_API_URL` permite otro origen, sin `/api`:

```powershell
$env:DIALO_TEST_API_URL = "http://localhost:3001"
npm run smoke:channel-realtime -w apps/backend
Remove-Item Env:DIALO_TEST_API_URL
```

| Comando (`npm run … -w apps/backend`) | Qué comprueba | Datos que permanecen |
| --- | --- | --- |
| `smoke:messages` | T-11: envío, edición, eliminación, pestañas, terceros, pérdida de amistad y operación tras logout | Tres cuentas `t11_*`, conversación y mensaje eliminado lógicamente; retira amistad y revoca sesiones |
| `smoke:channels` | T-22: tipos, CRUD, orden/creaciones concurrentes, eventos, varias pestañas y abandono | Tres cuentas `t22_*`; elimina su comunidad y revoca sesiones |
| `smoke:channel-access` | T-23: validación, permisos por rol/usuario, solo lectura, voz/video, revocación/recuperación y concurrencia | Tres cuentas `t23_*`; elimina su comunidad y revoca sesiones |
| `smoke:channel-messages` | T-25: historial vacío, límites, autenticación, solo lectura, tipos, revocación y abandono | Tres cuentas `t25_*`; elimina su comunidad y revoca sesiones |
| `smoke:channel-realtime` | T-26: mensajes persistidos, edición/borrado propio y moderado, paginación, cuatro pestañas, terceros, concurrencia, permisos y sesión receptora | Tres cuentas `t26_*`; elimina su comunidad/mensajes y revoca sesiones |

No hay smoke específico de comunidades. Cada smoke genera sus propias cuentas con contraseñas aleatorias y no reutilizables desde la UI. No modifica datos preexistentes, pero un fallo/interrupción puede dejar sus propios datos pendientes de limpieza. Revisar la salida si informa una comunidad pendiente.

Un resultado correcto muestra `T-11 OK`, `T-22 OK`, `T-23 OK`, `T-25 OK` o `T-26 OK`, según el comando. Un fallo termina con código distinto de cero. No se imprimen cookies ni contraseñas.

Los smokes T-22 y T-25 conservan su alcance acotado: T-22 no crea mensajes para probar el bloqueo de cambio de tipo; T-25 consulta canales vacíos y no acredita paginación con contenido ni redacción de borrados. Esos casos están en las suites aisladas y el smoke de T-26. No es porque falte la mensajería: T-26 ya está implementada.

El smoke T-26 comprueba moderación por propietario; la matriz de moderadores/pares/superiores se prueba en la suite aislada. Los smokes complementan, no reemplazan, la integración completa.

## Frontend y validación final

La suite del frontend se ejecuta por separado y simula HTTP/Socket.IO:

```sh
npm run test -w apps/frontend
npm run build -w apps/frontend
```

El recorrido manual con distintas cuentas, varias pestañas y móvil está en [la guía frontend](../../../docs/frontend.md#recorrido-manual-integrado). La aprobación de estas pruebas no implica que T-15 esté completa ni que se haya medido/optimizado la latencia de la instancia del equipo.

## Modelo de roles personalizados (T-28)

`npm run test:roles-model -w apps/backend` requiere TEST_DATABASE_URL exclusiva de pruebas. Crea un schema `test_t28_<id>`, aplica las migraciones del 50%, carga datos con ese modelo, aplica la migracion de roles y comprueba que se conserven. Tambien prueba roles multiples, duplicados, referencias entre comunidades, nombres reservados, permisos vacios y limpieza al eliminar roles o membresias.

### Roles personalizados: CRUD (T-29)

Con `TEST_DATABASE_URL` apuntando a una PostgreSQL exclusiva de pruebas:

```sh
npm run db:generate -w apps/backend
npm run test:roles -w apps/backend
```

La suite crea un schema aleatorio `test_t29_*`, aplica las tres migraciones y elimina únicamente ese schema al terminar. Levanta su propia API en un puerto libre: no necesita `npm run dev`, credenciales de correo ni Cloudinary. No usar la base compartida del equipo. Una interrupción forzada puede dejar el schema de prueba pendiente de limpieza.

Sin base, solo validaciones:

```sh
node --test apps/backend/test/roles-validation.test.js
```

Cubre autenticación de las cinco rutas, CRUD, permisos por rol base, protección de nombres/IDs/campos, aislamiento entre comunidades, unicidad con mayúsculas y concurrencia, cascadas sin borrar datos anteriores, eventos en varias pestañas y ausencia de difusión a terceros/canales privados. Prueba carreras entre actualizar/eliminar y borrar comunidad/crear rol. No acredita asignación por API, UI ni el evaluador de T-31.

## Permisos de roles personalizados (T-31)

`npm run test:channel-custom-roles -w apps/backend` requiere TEST_DATABASE_URL exclusiva de pruebas y crea su propio schema `test_t31_<id>`. Prueba la suma de permisos de rol base, roles personalizados y habilitacion individual, la configuracion de acceso con idRol, roles de otra comunidad, la misma decision en REST y Socket.IO, la perdida de ESCRIBIR conservando la lectura, la perdida de VER en varias pestanas y el aviso a `onChannelAccessChange`. Los escenarios prueban el evaluador con asignaciones preparadas dentro de `withCommunityAccessChange`.


## Asignación y remoción de roles (T-30)

`npm run test:channel-custom-roles -w apps/backend` verifica T-30 y T-31 juntos usando una base exclusiva de pruebas. Cubre actualización de roles vía HTTP, jerarquía, rechazo de IDs de otra comunidad, repetición concurrente, ausencia de eventos para terceros, abandono concurrente y cambios de acceso en varias pestañas. La eliminación por el CRUD de T-29 también se prueba contra el punto de integración de T-31.


### Baneos (T-41)

`npm run test:community-bans -w apps/backend` requiere `TEST_DATABASE_URL` de una base exclusiva de pruebas. Crea y elimina su propio esquema `test_t41_*`. Verifica jerarquía, privacidad, roles personalizados sin autoridad, idempotencia, concurrencia con invitaciones, revocación de salas en varias pestañas, persistencia del historial y reingreso después del desbloqueo.

## Infraestructura de llamadas (T-34)

`npm run test:media -w apps/backend` no necesita base de datos ni cuenta de LiveKit: usa claves de prueba y un proveedor simulado o un puerto cerrado. Prueba la configuracion vacia, el contenido y la duracion del token, las fuentes segun permisos, la caida del proveedor con error controlado, la firma de los webhooks y que `/api/health` siga respondiendo aunque LiveKit no conteste.

La conectividad real (tres participantes en dos redes) y la medicion de la revocacion se hacen a mano, con `media:token` y `media:sacar`, siguiendo [la guia de llamadas](../../../docs/llamadas.md).

## Ingreso y autorizacion de llamadas (T-35)

`npm run test:calls -w apps/backend` requiere TEST_DATABASE_URL exclusiva de pruebas y crea su propio schema `test_t35_<id>`. LiveKit se simula: los tokens se firman de verdad y las llamadas al servidor se registran. Prueba el ingreso con VER, las fuentes del token segun HABLAR y TRANSMITIR, el rechazo sin VER, en canales de texto y de otra comunidad, LiveKit no configurado, eventos con ingreso falso o repetidos, la salida idempotente, una llamada activa por usuario, sesion cerrada o permiso perdido antes de conectar y la reconciliacion con lo que hay en LiveKit.

## Revocacion en llamadas activas (T-40)

`npm run test:calls-revocation -w apps/backend` requiere TEST_DATABASE_URL exclusiva de pruebas y crea su propio schema `test_t40_<id>`. LiveKit se simula y se registra cada operacion. Prueba que perder TRANSMITIR corte solo esas fuentes, que perder VER o el rol que lo daba saque de la llamada, baneo y desbaneo, abandono, borrado o cambio de tipo del canal, borrado de la comunidad, logout de una sola sesion, cambio de contrasena, reingreso con un token anterior, falla de LiveKit al revocar y la reconciliacion con sesiones vencidas.
