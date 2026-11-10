# Llamadas de voz y video - Dialo (F-10)

Infraestructura de T-34. Las rutas de ingreso y salida son de T-35, la interfaz de T-36 a T-39 y la revocacion completa de T-40.
El audio y el video no pasan por Socket.IO: van por un servidor multimedia (SFU). Socket.IO sigue siendo solo para chat y eventos.

---

## Proveedor elegido: LiveKit

| Opcion | A favor | En contra |
| --- | --- | --- |
| **LiveKit** (elegida) | SFU open source; SDK de servidor para Node y de cliente para React; tokens con permisos por fuente (microfono, camara, pantalla); webhooks firmados; se puede usar en la nube o en Docker | Un token no se puede anular antes de que venza (ver revocacion) |
| mediasoup | Muy flexible y sin servicio externo | Hay que programar la senalizacion, las salas y el TURN a mano; mucho trabajo para el tiempo del TP |
| Jitsi | Salas listas | Pensado para su propia interfaz; dificil atar permisos por canal y por fuente |
| Daily / Twilio | Servicio administrado | Pago o con limites mas chicos; sin opcion de levantarlo localmente |

---

## Configuracion

Variables del backend (`apps/backend/.env`). Si estan vacias, las llamadas quedan deshabilitadas y el chat funciona igual:

```
LIVEKIT_URL=""
LIVEKIT_API_KEY=""
LIVEKIT_API_SECRET=""
```

Las claves solo existen en el backend. El navegador recibe un token de corta duracion y la URL; nunca la clave ni el secreto.

### Opcion A: LiveKit Cloud (recomendada para la demo)

1. Crear un proyecto gratis en https://cloud.livekit.io.
2. En Settings > Keys crear una clave y copiar URL (`wss://...livekit.cloud`), API key y API secret al `.env`.
3. Ya incluye HTTPS/WSS y servidores TURN, asi que funciona entre redes distintas sin configurar nada mas.
4. Para recibir eventos: en Settings > Webhooks agregar `https://<dominio-del-backend>/api/media/webhook` con la misma clave. En local hace falta exponer el backend (por ejemplo con un tunel) para que LiveKit lo alcance.

### Opcion B: LiveKit en Docker (desarrollo local)

```
docker run --rm -p 7880:7880 -p 7881:7881 -p 7882:7882/udp livekit/livekit-server --dev --bind 0.0.0.0
```

```
LIVEKIT_URL="ws://localhost:7880"
LIVEKIT_API_KEY="devkey"
LIVEKIT_API_SECRET="secret"
```

El modo `--dev` sirve solo en la misma red: no tiene TURN ni HTTPS. Para probar entre redes distintas usar la opcion A.

### Comprobar

`GET /api/media/health` responde `200 { "disponible": true }` si LiveKit contesta, o `503 MEDIA_UNAVAILABLE` si no esta configurado o no responde en 3 segundos.

---

## Contrato

- Sala: una por canal de VOZ o VIDEO, con nombre `canal-<idCanal>`.
- Identidad: `usuario-<idUsuario>`. Siempre la arma el servidor a partir de la sesion; el cliente no la elige.
- Token: lo emite el backend (T-35) despues de validar sesion y VER. Vence a los 10 minutos.
  - Sin HABLAR ni TRANSMITIR: puede escuchar y ver, no publicar.
  - HABLAR: puede publicar microfono.
  - TRANSMITIR: puede publicar camara y pantalla.
- Cada ingreso lleva un identificador propio (`ingreso`) en los metadatos del participante.
- Estados del cliente: `CONECTANDO`, `CONECTADO`, `RECONECTANDO`, `DESCONECTADO`. Ante un corte, el cliente pide un token nuevo al backend antes de reconectar: nunca reutiliza el anterior.
- Llamadas simultaneas: una sola llamada activa por usuario. Si ya esta en otra sala, el ingreso responde `409 ALREADY_IN_CALL` y el cliente ofrece salir de la anterior.

Errores:

- `503 MEDIA_UNAVAILABLE`: LiveKit no configurado o caido. El chat sigue funcionando.
- `401 INVALID_WEBHOOK`: evento sin firma valida; se descarta.

### Ingreso, salida y participantes (T-35)

POST /api/channels/:id/call/join
Auth: si. VER en el canal, que tiene que ser VOZ o VIDEO.
El servidor arma la identidad y la sala, registra un ingreso nuevo (invalida el anterior) y emite un token con las fuentes que permiten los permisos actuales.
200: { "llamada": { "url": "wss://...", "token": "...", "sala": "canal-21", "expiraEn": 600, "misPermisos": ["VER", "HABLAR"] } }
Errores:

- 404 CHANNEL_NOT_FOUND: no existe o no tiene VER.
- 400 NOT_A_CALL_CHANNEL: es un canal de TEXTO.
- 409 ALREADY_IN_CALL: ya esta conectado en otro canal. details[0].idCanal indica cual.
- 503 MEDIA_UNAVAILABLE: LiveKit no configurado o caido.

POST /api/channels/:id/call/leave
Auth: si. Sale de la llamada de ese canal y se lo saca de la sala. Repetirlo tambien responde 204.
204.

GET /api/channels/:id/call/participants
Auth: si. VER.
Solo conexiones activas confirmadas por LiveKit, sin duplicados ni tokens, ordenadas por hora de ingreso.
200: { "items": [{ "usuario": UsuarioPublico, "desde": "2026-11-10T12:00:00.000Z" }] }

Socket: a quienes estan suscriptos al canal (`channel:subscribe`) les llegan
`call:participant-joined` { idCanal, participante } y `call:participant-left` { idCanal, idUsuario }.

Un participante queda registrado en `participante_llamada` (una fila por usuario). Pasa a conectado recien cuando llega el evento `participant_joined` con su ingreso; si el ingreso no coincide, la sesion ya no es valida o perdio VER, el servidor lo saca de la sala. Las autorizaciones que no se usan antes de que venza el token (10 minutos) se borran. Cada 60 segundos se compara la base con LiveKit: se quitan las conexiones que ya no existen y se saca a quien este en una sala sin un ingreso valido.

### Eventos del proveedor

LiveKit avisa a `POST /api/media/webhook` cuando alguien entra o sale. El backend verifica la firma con la clave antes de usar el evento y lo pasa a los oyentes registrados con `onMediaEvent` (T-35 los usa para mantener los participantes reales).

---

## Revocacion

Desconectar Socket.IO no corta el audio ni el video: son conexiones distintas. Y un token de LiveKit sigue sirviendo hasta que vence, aunque se le saque al usuario de la sala.

Estrategia:

1. Cortar la conexion activa con `sacarParticipante(idCanal, idUsuario)` del adaptador (RoomService `removeParticipant`).
2. Token de vida corta (10 minutos): un token viejo deja de servir rapido.
3. Mientras el token siga vigente, el reingreso se frena en el webhook `participant_joined`: si su `ingreso` ya no esta autorizado (sesion revocada, sin VER o salida anterior), el backend lo vuelve a sacar en el momento. T-35 guarda los ingresos validos y T-40 los invalida.
4. El cliente nunca reconecta con un token anterior: siempre pide uno nuevo y el backend vuelve a autorizar.

Cota objetivo: la conexion activa se corta en menos de 2 segundos desde que se decide la revocacion. Para medirla, ver la prueba manual.

### Que corta una llamada (T-40)

| Causa | Efecto en la llamada |
| --- | --- |
| Pierde VER (habilitaciones, rol base, rol personalizado) | Se lo saca de la sala y se borra su registro |
| Pierde HABLAR o TRANSMITIR pero conserva VER | Sigue en la llamada; se actualizan sus permisos en LiveKit y se cortan solo las fuentes perdidas |
| Gana HABLAR o TRANSMITIR | Se actualizan sus permisos sin volver a entrar |
| Baneo o abandono de la comunidad | Se lo saca de la sala; un token anterior no sirve para volver. Desbanear no devuelve la membresia ni la llamada |
| Canal borrado o que deja de ser VOZ/VIDEO | Se cierra la sala entera |
| Comunidad borrada | Se cierran las salas de todos sus canales |
| Logout | Solo las llamadas de esa sesion; las demas sesiones siguen |
| Cambio de contrasena | Las llamadas de todas las sesiones del usuario |
| Vencimiento o revocacion externa de la sesion | Se corta en la siguiente reconciliacion (hasta 60 segundos) |

Los cambios de permisos llegan desde `onChannelAccessChange` (T-31) y los cierres de sesion desde `onSessionEnded` (T-15).
Al conectar con un token anterior que todavia no vencio, el servidor aplica en el momento los permisos actuales: una fuente quitada no vuelve.

Si LiveKit falla al revocar, el registro igual se borra (el usuario no puede volver a entrar ni aparece en la lista) y la reconciliacion de cada 60 segundos termina el corte: recorre las salas de LiveKit, saca a quien no tenga un ingreso valido, vuelve a comprobar sesion y VER de cada conectado, reaplica sus permisos y cierra las salas de canales que ya no existen.

---

## Prueba manual (tres participantes, dos redes)

Sirve antes de que exista la interfaz de T-36, usando la pagina de prueba de LiveKit.

1. Con el `.env` configurado (opcion A), generar un token por persona:
   `npm run media:token -w apps/backend -- <idUsuario> <idCanal>`
2. Cada participante abre https://meet.livekit.io, pestana Custom, y pega la URL y su token. Usar al menos un participante con datos moviles y otro en otra red wifi: esa conexion necesita el TURN de LiveKit Cloud.
3. Comprobar que los tres se escuchan y se ven.
4. Revocacion: con alguien conectado, correr
   `npm run media:sacar -w apps/backend -- <idUsuario> <idCanal>`
   El script muestra cuanto tardo LiveKit en confirmar; el participante tiene que quedar afuera.
5. Reingreso con token anterior: volver a entrar con el mismo token. En T-34 LiveKit lo acepta mientras no venza; desde T-35 el webhook lo saca en el momento.

Registrar en el PR los resultados: redes usadas, tiempo de desconexion medido y limites del plan gratuito del entorno usado.
