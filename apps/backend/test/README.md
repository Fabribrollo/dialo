# Pruebas de conversaciones privadas (T-10 y T-11)

## Canales (T-22)

`npm run test:channels -w apps/backend` requiere TEST_DATABASE_URL exclusiva de
pruebas. Crea y elimina solamente un schema `test_t22_<id aleatorio>`, aplica
todas las migraciones y ejecuta la API y sockets con sesiones reales.

La suite usa cinco conexiones por defecto para verificar solicitudes
concurrentes. Si TEST_DATABASE_URL fija connection_limit, se respeta ese valor.
Para validar bloqueos entre conexiones usar PostgreSQL real con al menos cinco
conexiones disponibles; PGlite multiplica conexiones sobre una sola y no
acredita ese escenario. No configurar la base del equipo como base de pruebas.

```powershell
$env:TEST_DATABASE_URL = "postgresql://USUARIO:CONTRASENA@HOST/BASE_DE_PRUEBAS?sslmode=require"
npm run test:channels -w apps/backend
Remove-Item Env:TEST_DATABASE_URL
```

La cobertura incluye autenticacion, roles, DTO publico, permisos por tipo/rol/
integrante, filtrado privado, CRUD, validacion, cambios de tipo con contenido,
cascadas, orden completo/estable, concurrencia y eventos con varias pestanas.
Tambien simula sockets ya unidos a una room para comprobar su retiro al perder
VER o al eliminar el canal. La suscripcion de cliente esta implementada en T-23.

Con la app ya ejecutandose, `npm run smoke:channels -w apps/backend` verifica el
recorrido contra el servidor real (localhost:3000 por defecto o
DIALO_TEST_API_URL). Crea tres cuentas t22_*, una comunidad privada e invitacion
de prueba y canales de los tres tipos. Comprueba CRUD, persistencia, permisos,
orden, creaciones y reordenamientos concurrentes, eventos, varias pestanas y abandono. Al finalizar
elimina unicamente su comunidad y revoca sus sesiones; las cuentas de prueba
permanecen. Si falla la limpieza, informa el ID de la comunidad pendiente.

No modifica comunidades, cuentas o conversaciones preexistentes. No ejecuta
migraciones ni el seed y no requiere credenciales de usuarios reales. La
restriccion de cambio de tipo con mensajes se prueba en la suite aislada; el
smoke no inserta mensajes de canal porque T-26 todavia no existe.

La fixture de T-11 para un mensaje de canal crea ahora un canal valido, en vez de
usar un ID arbitrario que viola la FK agregada en T-14.

Estas pruebas ejercitan las cuatro rutas HTTP con sesiones reales, Prisma y una base compatible con PostgreSQL. También verifican el evento `conversation:new` mediante clientes Socket.IO.

## Ejecución

1. Desde la raíz del repositorio, ejecutar `npm ci` y `npm run db:generate -w apps/backend`.
2. Configurar `TEST_DATABASE_URL` con una conexión **exclusiva de pruebas**, accesible directamente y con permiso para crear schemas. No usar la conexión de producción.
3. Ejecutar `npm run test:conversations -w apps/backend`, `npm run test:messages -w apps/backend` y `npm run test:communities -w apps/backend`. Cada suite prepara y elimina su propio schema.

Ejemplo en PowerShell, reemplazando la conexión por la de una base de pruebas:

```powershell
$env:TEST_DATABASE_URL = "postgresql://USUARIO:CONTRASENA@HOST/BASE_DE_PRUEBAS?sslmode=require"
npm run test:conversations -w apps/backend
Remove-Item Env:TEST_DATABASE_URL
```

El test no utiliza `DATABASE_URL` del `.env`. Crea un schema `test_t10_<identificador aleatorio>` o `test_t11_<identificador aleatorio>`, ejecuta allí el SQL de todas las migraciones de `prisma/migrations` en orden (incluidas sus restricciones e índices, ver `migrations.js`), genera cuentas de prueba y elimina únicamente ese schema al finalizar. Si se interrumpe el proceso abruptamente, el schema temporal puede quedar pendiente de limpieza manual. Las migraciones nuevas se suman solas a la preparación del schema.

## Cobertura

- Autenticación de todas las rutas con cookies y rechazo del acceso de desarrollo en producción.
- Creación, reutilización y par ordenado de participantes.
- Validación de IDs, límites y cursores.
- Rechazo de conversación propia, sin amistad y acceso de terceros.
- Creación concurrente: una barrera fuerza lecturas iniciales vacías; la restricción SQL real resuelve las escrituras del mismo par.
- Evento personalizado, varias pestañas, unión a rooms y ausencia de eventos duplicados al reutilizar.
- Listado propio, orden por actividad y datos públicos.
- Historial conservado y escritura deshabilitada al eliminar amistad.
- Ocultación de contenido eliminado e identidad invisible.
- Paginación por fecha e ID, fechas iguales, inserciones entre páginas y fin del historial.

La suite `test:conversations` cubre T-10; las operaciones de mensajes pertenecen a la suite `test:messages` de T-11.

## Cobertura de T-11

- Handshake sin cookie, falso, malformado, vencido y revocado; identidad de desarrollo deshabilitada en producción.
- Rooms personales y solo de conversaciones propias, inicialización del primer evento y reconexión.
- Envío persistido y autor obtenido de la sesión, sin suplantación mediante payloads.
- Entrega de eventos a ambos participantes y todas sus pestañas, excluyendo terceros.
- Rechazo de nuevos envíos después de eliminar amistad desde sockets ya conectados.
- Validación de IDs, contenido vacío o solo espacios, límite de 2000 caracteres y ack con detalles.
- Edición solo del autor con fecha de edición y evento correspondiente.
- Eliminación lógica solo del autor, fecha y usuario de eliminación, ack y evento sin contenido.
- Redacción de contenido eliminado en historial, detalle y último mensaje.
- Mensajes inexistentes, ya eliminados y de canales fuera del alcance.
- Sesión revocada por logout o vencida después de conectar: las tres operaciones se rechazan y el socket se desconecta.
- Eliminaciones simultáneas y edición/eliminación concurrentes sin resucitar el mensaje.
- Eventos sin callback y ejecución del comando de verificación manual contra el servidor de pruebas.

## Verificación contra el servidor en ejecución

Con `npm run dev` ejecutándose en otra terminal, desde la raíz:

```powershell
npm run smoke:messages -w apps/backend
```

Este comando **utiliza la base configurada en el backend que está en ejecución**, que puede ser la Neon del equipo. Crea tres cuentas nuevas `t11_<identificador>_a/b/c`, una amistad, una conversación y un mensaje. Prueba envío, edición, eliminación, varias pestañas, acceso de terceros, pérdida de amistad e invalidación por logout, sin usar cuentas existentes ni solicitar sus contraseñas. Al finalizar desconecta sockets y revoca las sesiones de prueba.

Las cuentas y la conversación permanecen en la base como datos de prueba; el mensaje queda eliminado lógicamente y la amistad se elimina. Si el comando falla a mitad del recorrido, pueden quedar también datos de las etapas anteriores. No borra ni modifica cuentas o conversaciones preexistentes.

La URL por defecto es `http://localhost:3000`. Para otro puerto:

```powershell
$env:DIALO_TEST_API_URL = "http://localhost:3001"
npm run smoke:messages -w apps/backend
Remove-Item Env:DIALO_TEST_API_URL
```

Los fallos hacen terminar el comando con código distinto de cero y un mensaje `T-11 FALLÓ`. Una ejecución correcta muestra `T-11 OK` y los nombres de las cuentas creadas. No imprime cookies ni contraseñas.

La comprobación completa de vencimiento, errores de validación y carreras simultáneas se realiza con `test:messages` sobre una base exclusiva de pruebas. El comando `smoke:messages` comprueba el recorrido principal contra la instancia que ya está ejecutándose; no sustituye esa suite.


## Permisos y suscripciones de canales (T-23)

`npm run test:channel-access -w apps/backend` ejecuta 4 pruebas puras de la
matriz/validaciones y 14 pruebas de integracion HTTP/Socket.IO con Prisma.
Requiere TEST_DATABASE_URL exclusiva de pruebas, crea/elimina su propio schema
`test_t23_<id aleatorio>` y usa cinco conexiones salvo configuracion explicita.
Para comprobar concurrencia entre conexiones se requiere PostgreSQL nativo con
al menos cinco conexiones; un emulador con una sola conexion no lo acredita.

```powershell
$env:TEST_DATABASE_URL = "postgresql://USUARIO:CONTRASENA@HOST/BASE_DE_PRUEBAS?sslmode=require"
npm run test:channel-access -w apps/backend
npm run test:channels -w apps/backend
npm run test:communities -w apps/backend
Remove-Item Env:TEST_DATABASE_URL
```

Sin base de datos se pueden ejecutar solo las pruebas puras:

```powershell
npm exec -w apps/backend -- node --test test/channel-permissions.test.js
```

Cubre consulta/reemplazo completo, normalizacion, rechazo de escalamiento,
roles e integrantes, DTO sin secretos, membresia de otra comunidad, lectura
sin escritura/moderacion, voz/video, revocacion y recuperacion en dos pestanas,
ausencia de eventos despues del retiro de rooms, logout, reemplazos simultaneos,
suscripcion frente a revocacion, abandono y borrado de comunidad.

Con la app ya ejecutandose:

```powershell
npm run smoke:channel-access -w apps/backend
```

El smoke usa localhost:3000 o DIALO_TEST_API_URL. Crea tres cuentas t23_*, una
comunidad privada, invitacion y canales propios; prueba permisos por rol y
usuario, solo lectura, validaciones, revocacion/recuperacion, varias pestanas,
reemplazos concurrentes, permisos de voz y salida de la comunidad. Elimina solo
su comunidad y revoca sus sesiones al terminar. Las tres cuentas permanecen.
No necesita acceso directo a la base, no ejecuta seed ni migraciones y no modifica
datos preexistentes. El resultado esperado es T-23 OK; cualquier fallo termina
con codigo distinto de cero. No reemplaza la suite aislada de integracion.
