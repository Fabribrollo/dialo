# Dialo

Aplicación de comunicación con cuentas, amigos, conversaciones privadas y comunidades con canales de texto en tiempo real.

React + Vite · Express · Prisma · PostgreSQL (Neon) · Socket.IO.

## Alcance actual

- Registro, inicio de sesión y recuperación de contraseña; perfil, foto y disponibilidad.
- Búsqueda de usuarios, solicitudes y amistades.
- Conversaciones privadas con historial, envío, edición y eliminación de mensajes propios.
- Creación, edición y eliminación de comunidades; invitaciones e integrantes.
- Canales con ordenamiento, acceso por rol/usuario, historial y mensajería con moderación.
- Interfaz integrada con navegación lateral en escritorio y navegación inferior en móvil.

Voz y video permiten configurar canales, pero todavía no hay llamadas. No están implementados el explorador público, el ingreso directo, la transferencia de propiedad ni la administración de roles/expulsiones. La invalidación proactiva global de sockets y el manejo de errores de autenticación siguen pendientes en [T-15](https://github.com/Fabribrollo/dialo/issues/65). Los controles de sesión específicos de canales no reemplazan esa tarea.

## Estructura

| Ruta | Contenido |
| --- | --- |
| `apps/backend/` | API REST, Socket.IO, esquema y migraciones Prisma |
| `apps/frontend/` | React, Vite y pruebas de interfaz |
| `docs/` | Contratos HTTP/socket y guía de frontend |

## Puesta en marcha

Ejecutar los comandos desde la raíz. Usar Node.js 22.12 o superior compatible con los motores de las dependencias (por ejemplo, Node 22.12+ de la rama 22 o Node 24+), npm y una base PostgreSQL accesible. Aunque el `package.json` raíz declara `>=22`, Vite exige al menos 22.12 en esa rama.

1. Instalar las versiones del lockfile:

   ```sh
   npm ci
   ```

2. Copiar `apps/backend/.env.example` a `apps/backend/.env`. Configurar `DATABASE_URL` y `DIRECT_URL` para la base de desarrollo; en Neon usar un branch propio. No ejecutar migraciones o seed sobre una base compartida sin coordinarlo.

3. Copiar `apps/frontend/.env.example` a `apps/frontend/.env`. Para usar registro/login y sesiones reales, dejar **vacío** `VITE_DEV_USER_ID`: el ejemplo trae `1`, que activa una identidad de desarrollo.

   ```dotenv
   VITE_API_URL=""
   VITE_SOCKET_URL=""
   VITE_DEV_USER_ID=""
   ```

4. Generar Prisma Client y aplicar las migraciones existentes:

   ```sh
   npm run db:generate -w apps/backend
   npm run db:deploy -w apps/backend
   npm exec -w apps/backend -- prisma migrate status
   ```

   Estos comandos se ejecutan en el workspace del backend para cargar su `.env`. `db:deploy` aplica migraciones versionadas; `db:migrate` se reserva para desarrollar cambios del modelo y crear una migración nueva.

5. Levantar ambas apps:

   ```sh
   npm run dev
   ```

   Frontend: <http://localhost:5173>. Estado de API: <http://localhost:3000/api/health>.

   Vite redirige `/api` y `/socket.io` a `http://localhost:3000`. Si se cambia el puerto de la API, también se debe ajustar ese proxy o configurar las URLs del frontend y CORS. Reiniciar Vite después de cambiar sus variables de entorno.

## Variables de entorno

No versionar archivos `.env`, cookies ni credenciales. Las variables `VITE_*` se incluyen en el cliente y no deben contener secretos.

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | Conexión de Prisma en ejecución; puede usar el endpoint pooler de Neon |
| `DIRECT_URL` | Conexión directa usada por Prisma para migraciones |
| `PORT` | Puerto del backend; por defecto `3000` |
| `CLIENT_URL` | Origen del frontend permitido por CORS y base del enlace de recuperación; por defecto `http://localhost:5173` |
| `NODE_ENV` | `production` activa cookies Secure/SameSite=None y deshabilita la autenticación de desarrollo del backend |
| `RESEND_API_KEY`, `MAIL_FROM` | Envío de recuperación por correo; sin API key no se envía. En desarrollo el enlace también se registra en la consola del backend |
| `CLOUDINARY_URL` | Credenciales para subir fotos e imágenes; necesarias para usar esas operaciones |
| `VITE_API_URL` | Base de API, incluyendo `/api`; vacío usa `/api` con el proxy de Vite |
| `VITE_SOCKET_URL` | Origen de Socket.IO, sin `/api`; vacío usa el origen actual |
| `VITE_DEV_USER_ID` | Identidad de prueba solo en desarrollo; dejar vacío para comprobar sesiones reales |

En producción configurar las URLs reales, HTTPS y `CLIENT_URL` del despliegue. El proxy de Vite es de desarrollo; el hosting del frontend debe resolver las rutas de React y conectar con la API/Socket.IO. La configuración actual asume una instancia de API; varias instancias requieren coordinación y un adapter de Socket.IO.

## Scripts

| Comando desde la raíz | Qué hace |
| --- | --- |
| `npm run dev` | Backend y frontend en paralelo |
| `npm run dev:back` / `npm run dev:front` | Una sola app |
| `npm run build` | Build de producción del frontend |
| `npm run test -w apps/frontend` | Tests de frontend con servicios simulados |
| `npm run db:generate -w apps/backend` | Generar Prisma Client |
| `npm run db:deploy -w apps/backend` | Aplicar migraciones existentes |
| `npm run db:migrate` | Crear/aplicar migraciones durante el desarrollo del modelo |
| `npm run db:studio` | Abrir Prisma Studio |
| `npm run db:seed` | Cargar/recrear datos de demostración en la base configurada |
| `npm install <paquete> -w apps/backend` | Agregar una dependencia al backend |

No existe un `npm test` global ni un script `test` general del backend. Las suites de integración y sus requisitos están en [la guía de pruebas](apps/backend/test/README.md).

### Datos de demostración

El seed es opcional. Reutiliza `seed_ana`, `seed_beto`, `seed_carla`, `seed_dario` y `seed_eva`; al crearlos asigna la contraseña `seed12345`. No restablece la contraseña si el usuario ya existía. Borra y recrea las comunidades llamadas `Comunidad de prueba (seed)` y `Comunidad publica (seed)`, con sus datos en cascada; no ejecutarlo sobre una base con datos que se necesiten conservar bajo esos nombres.

En la comunidad privada: Ana es propietaria, Beto administrador, Carla moderadora y Dario/Eva integrantes. Incluye canales públicos, privados y de solo lectura, mensajes de ejemplo e invitación `seedprueba01` de hasta diez usos. No crea amistades ni conversaciones privadas. Para esos recorridos se pueden usar las solicitudes de amistad desde la UI.

## Verificación y documentación

- [API de cuentas, perfil, amigos y privados](docs/api.md).
- [Comunidades, invitaciones, canales y mensajes](docs/comunidades.md).
- [Eventos Socket.IO y límites de sesión](docs/sockets.md).
- [Frontend y recorrido manual](docs/frontend.md).
- [Suites backend y smoke tests](apps/backend/test/README.md).

La suite frontend usa mocks y no necesita una base. Las suites backend requieren `TEST_DATABASE_URL` exclusiva y crean schemas temporales. Los comandos `smoke:*` actúan sobre la base del servidor en ejecución y dejan cuentas de prueba; revisar su alcance antes de ejecutarlos.

## Problemas frecuentes

- `@prisma/client did not initialize yet`: ejecutar `npm run db:generate -w apps/backend`, también después de una instalación limpia cuando sea necesario.
- `EPERM` al generar Prisma en Windows: detener primero el backend, Prisma Studio u otros procesos del proyecto que tengan cargado el motor, volver a generar y reiniciar la app.
- `DIRECT_URL` ausente al consultar Prisma desde la raíz: usar `npm exec -w apps/backend -- prisma migrate status` para cargar el entorno correcto.
- Error de proxy `ECONNREFUSED` durante el arranque: comprobar que la API termine de iniciar en el puerto esperado. Si persiste, revisar su consola y las URLs/proxy.
- Cambiar de cuenta no cambia la identidad de desarrollo: dejar `VITE_DEV_USER_ID` vacío y reiniciar Vite.
