# Docker (T-55)

Levanta Dialo completo desde un clon limpio: PostgreSQL local, migraciones, backend y frontend. Las llamadas con LiveKit son un perfil opcional.

## Requisitos

- Docker Desktop (Windows o macOS) o Docker Engine con el plugin Compose v2.
- Puertos libres: `8080` (app) y `5433` (PostgreSQL). Se cambian en `.env` con `APP_PORT` y `DB_PORT`.

## Arranque

```sh
cp docker.env.example .env   # opcional: claves de IA, Cloudinary, Resend o LiveKit
docker compose up --build
```

Abrir <http://localhost:8080>. La landing, el registro, el login y el chat en tiempo real funcionan sin completar ninguna clave.

Qué pasa al iniciar:

1. `db` arranca PostgreSQL 16 y espera a estar sano.
2. `migrate` corre `prisma migrate deploy`: aplica en orden las migraciones de `apps/backend/prisma/migrations` que falten y termina. Una base nueva recibe todas.
3. `backend` arranca recién cuando las migraciones terminaron bien.
4. `frontend` sirve el build de Vite con nginx y reenvía `/api` y `/socket.io` al backend. Todo queda en un mismo origen, así que la cookie de sesión funciona sobre `http://localhost` (`COOKIE_SECURE=false`, `COOKIE_SAMESITE=lax`).

## Datos y reinicio

| Acción | Comando | Datos |
| --- | --- | --- |
| Detener | `docker compose down` | Se conservan en el volumen `dialo_db-data` |
| Volver a levantar | `docker compose up` | Se conservan; `migrate` aplica solo las nuevas |
| Reconstruir tras cambios de código | `docker compose up --build` | Se conservan |
| Empezar de cero | `docker compose down -v` | Se borran |
| Ver logs del backend | `docker compose logs -f backend` | — |
| Estado de migraciones | `docker compose run --rm migrate npx prisma migrate status` | — |

Para conectarse a la base desde la máquina: `postgresql://dialo:dialo@localhost:5433/dialo`.

## Servicios opcionales

Se configuran en `.env` (ver `docker.env.example`). Sin ellos el chat funciona y cada función externa muestra que no está disponible.

| Servicio | Variables | Sin configurar |
| --- | --- | --- |
| IA | `OPENAI_API_KEY`, `OPENAI_GENERATION_MODEL` | Se crean comunidades y se modera a mano |
| Imágenes | `CLOUDINARY_URL` | No se pueden subir fotos ni adjuntos de imagen |
| Correo | `RESEND_API_KEY`, `MAIL_FROM` | No se envía el correo de recuperación |
| Llamadas | `LIVEKIT_*` | Las llamadas aparecen deshabilitadas |

### Llamadas con LiveKit local

```sh
# en .env
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_URL=http://livekit:7880
LIVEKIT_API_KEY=dialo-local
LIVEKIT_API_SECRET=dialo-local-secreto-de-desarrollo-123456

docker compose --profile llamadas up --build
```

- `LIVEKIT_URL` es la dirección que usa el navegador; `LIVEKIT_API_URL`, la que usa el backend dentro de la red de Docker.
- `docker/livekit.yaml` define la clave de ejemplo y el webhook hacia `http://backend:3000/api/media/webhook`, que mantiene la lista de participantes.
- Publica `7880/tcp`, `7881/tcp` y `50000-50100/udp`. Funciona con el navegador en la misma máquina; para probar desde otro dispositivo de la red hay que cambiar `node_ip` por la IP de la máquina.

Con LiveKit Cloud alcanza con completar `LIVEKIT_URL`, `LIVEKIT_API_KEY` y `LIVEKIT_API_SECRET` del proyecto y dejar vacío `LIVEKIT_API_URL`.

## Pruebas del backend contra la base de Docker

Las suites de integración necesitan una base exclusiva de pruebas (crean y borran su propio schema). Con el contenedor `db` levantado:

```sh
docker compose exec db createdb -U dialo dialo_test
TEST_DATABASE_URL="postgresql://dialo:dialo@localhost:5433/dialo_test" npm run test:moderation -w apps/backend
```

En PowerShell: `$env:TEST_DATABASE_URL="postgresql://dialo:dialo@localhost:5433/dialo_test"; npm run test:moderation -w apps/backend`.

## Seguridad

- `.dockerignore` excluye `.env`, `node_modules` y logs: ninguna credencial entra en las imágenes.
- Las claves se pasan como variables de entorno al iniciar, nunca en el repositorio.
- La clave de LiveKit de `docker/livekit.yaml` y la contraseña `dialo` de PostgreSQL son solo para uso local.
