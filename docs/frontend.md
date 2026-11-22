# Frontend de Dialo

Guía de la implementación integrada hasta T-27. Los contratos del servidor están en [api.md](api.md), [comunidades.md](comunidades.md) y [sockets.md](sockets.md).

## Alcance y navegación

| Ruta | Pantalla |
| --- | --- |
| `/` | Catálogo de conversaciones privadas |
| `/conversaciones/:id` | Chat privado e historial |
| `/amigos` | Búsqueda, solicitudes y amigos; Conversar obtiene o crea el chat |
| `/perfil` | Perfil, foto y disponibilidad |
| `/comunidades` | Comunidades de las que el usuario es integrante |
| `/comunidades/nueva` | Crear comunidad |
| `/comunidades/:id` | Resumen con canales autorizados, integrantes y acciones según rol |
| `/comunidades/:id/editar` | Editar comunidad |
| `/comunidades/:id/integrantes` | Lista de integrantes |
| `/comunidades/:id/invitaciones` | Invitaciones con GESTIONAR_INVITACIONES o administración |
| `/comunidades/:id/canales` | Catálogo de canales |
| `/comunidades/:id/canales/nuevo` | Crear canal para ADMIN/PROPIETARIO; `nuevo` se interpreta dentro de la ruta `:canalId` |
| `/comunidades/:id/canales/:canalId` | Chat de texto o detalle de voz/video y administración autorizada |
| `/invitacion/:codigo` | Vista previa y aceptación; requiere sesión |
| `/login`, `/register` | Acceso y registro para visitantes |
| `/forgot-password`, `/reset-password` | Recuperación de contraseña |

No hay explorador público, ingreso directo ni transferencia de propiedad en esta interfaz. Los canales de voz y video muestran el panel de llamada (ver más abajo).

## Presentación actual

En escritorio hay una barra lateral de 244 px, reducida a 208 px entre 761 y 1100 px, con iconos, texto y cuenta/conexión al pie. El contenido usa todo el ancho restante y conserva su desplazamiento. A 760 px o menos se usa cabecera compacta y navegación inferior.

La paleta es carbón `#26302E`, crema `#EBE4CF`, mostaza `#BBA149` y naranja quemado `#D03D01`, con tonos derivados para tarjetas, bordes y estados. Las acciones principales usan naranja con texto claro y la navegación activa, mostaza con texto carbón. Los nombres se ajustan al ancho; los cuerpos de mensaje tienen una longitud de lectura acotada.

Conversaciones y comunidades usan grillas adaptables. Amigos distribuye búsqueda/solicitudes y contactos por zonas; perfil separa identidad/foto y formulario. En móvil estas zonas se apilan. El resumen de comunidad muestra hasta ocho canales visibles y seis integrantes reales, con acceso a las listas completas, estados de carga y reintentos independientes. Rol, fecha y administración quedan agrupados al pie.

Los estilos viven en `src/styles/`: `index.css` (lo importa `main.jsx` y trae al resto), `chat.css`, `communities.css`, `channels.css`, `workspace.css`, `sidebar.css` y `calls.css`. Las funciones auxiliares viven en `src/utils/` (`chat.js` e `invitations.js`). Usan variables compartidas, fuentes del sistema y fallbacks monoespaciados; no requieren una biblioteca visual ni fuentes remotas.

## Sesión y conexión

`AuthProvider` consulta el perfil propio al iniciar. `App` monta un único `SocketProvider` habilitado para la identidad autenticada y lo reinicia al cambiar el ID. No se abre una conexión por conversación/canal. El cliente HTTP manda cookies con `credentials: include` y Socket.IO con `withCredentials: true`.

Para sesiones reales, dejar `VITE_DEV_USER_ID` vacío: el `.env.example` trae `1`. En desarrollo ese valor envía `x-dev-user-id` y `auth.devUserId`, y puede hacer que las pruebas usen una identidad fija. El build de producción del frontend no activa ese mecanismo; el backend lo rechaza cuando `NODE_ENV=production`.

**Pendiente T-15:** `AuthContext.refresh()` todavía convierte cualquier fallo en ausencia de usuario; no diferencia un 401 de una falla de red/servidor. En logout limpia la identidad local incluso si falla la petición. La conexión de esta pestaña se cierra al desmontar su provider, pero la desconexión proactiva global de otras pestañas/sesiones no está resuelta. `ConversationsProvider` reconsulta la identidad ante `UNAUTHORIZED` o desconexión forzada del servidor. No presentar estos comportamientos como una solución completa de T-15.

## Conversaciones privadas

`ConversationsProvider` conserva y ordena el listado por actividad; consume eventos de conversación, mensajes, amistad y perfil. Las revisiones y los números de petición impiden que respuestas antiguas reviertan eventos recientes. Una respuesta tardía de detalle no rehabilita la escritura tras eliminar amistad.

`useMessages` consulta páginas de 30 mensajes y ordena cronológicamente por fecha e ID. HTTP, ack y eventos se unifican por ID; el contenido eliminado no se restaura con respuestas antiguas. Cambiar de conversación o desmontar invalida consultas pendientes. Al reconectar se consulta el listado y la página reciente del historial; los mensajes anteriores se recuperan por cursor.

- Autor resuelto mediante `idAutor`, el usuario propio o `otroUsuario`.
- Enter envía, Shift+Enter agrega línea; máximo 2000 caracteres. Envío deshabilitado sin conexión o amistad.
- Solo el autor edita/elimina; confirmar eliminación en diálogo nativo. Los mensajes anteriores propios pueden modificarse aunque ya no haya amistad, según T-11.
- Una pérdida de amistad conserva el historial y deshabilita nuevos envíos. Aceptar otra vez recupera el listado desde HTTP.
- El borrador se conserva si falla el envío o la conexión; un ack no borra texto nuevo escrito mientras se esperaba.
- Un timeout consulta historial y requiere revisar el resultado antes de reintentar. No hay clave de idempotencia y reintentar puede generar otro mensaje.
- `user:updated` actualiza la identidad pública del participante; el perfil propio se consulta por HTTP para conservar `INVISIBLE`.

## Comunidades e invitaciones

`CommunitiesProvider` se monta al entrar en comunidades o invitaciones. Consume eventos de comunidad y membresía; al salir limpia sus listeners. Los detalles validan el acceso por HTTP y descartan respuestas de rutas anteriores. `community:updated` no incluye `miRol`: la UI conserva el suyo y reconsulta. Eliminación y abandono retiran las vistas abiertas; reconexión recupera los datos por HTTP.

ADMIN/PROPIETARIO editan nombre, tipo e imagen; solo el propietario elimina, con confirmación y foco inicial en Cancelar. La imagen admite JPG, PNG o WebP hasta 2 MB y se envía como multipart `imagen`. Datos e imagen se guardan en operaciones separadas: si falla solo la imagen se informa el guardado parcial y se conserva el ID para reintentar sin duplicar la comunidad. Se liberan las URLs locales de previsualización.

Los errores conservan borradores; cambios remotos no pisan formularios en edición. El backend decide todos los permisos. Un 403/404 no permite continuar mostrando detalles privados sin autorización.

Invitaciones admite 1 hora, 24 horas, 7 días o sin vencimiento; de 1 a 100 usos o sin límite. El enlace usa el origen actual del frontend. La UI distingue revocada, vencida y agotada. Si falla el portapapeles selecciona el texto para copia manual; revocar exige confirmación y no expulsa integrantes.

`ProtectedRoute` conserva solo un destino interno de invitación validado, usando el router y `sessionStorage`. Login/registro y recargas recuperan ese destino; volver a la invitación limpia el dato. No admite destinos externos. Ver una vista previa no crea una membresía y Rechazar solo vuelve al listado.

Aceptar bloquea envíos duplicados; respuesta HTTP y `community:new` se unifican por ID. Si llega el evento de ingreso pero se pierde la respuesta, se reconoce la membresía. La lista de integrantes muestra identidad pública, disponibilidad y rol; se actualiza ante eventos de membresía, reconexión, foco o petición manual.

No hay eventos de creación/revocación de invitaciones: se reconsultan al volver al foco, reconectar o actualizar. `user:updated` se envía únicamente al usuario y sus amigos, no a todos los integrantes de una comunidad. Las consultas HTTP recuperan identidades vigentes; no se promete notificación de perfil inmediata entre integrantes que no son amigos.

Los no propietarios pueden abandonar con confirmación; `community:left` retira la comunidad y cierra sus vistas en otras pestañas. El propietario no puede abandonar y la transferencia aún no está disponible.

## Canales y acceso

El catálogo muestra canales visibles, su tipo y privacidad. Al seleccionar uno se contrae en **Cambiar canal**; dentro están Actualizar, Crear y el ordenamiento. ADMIN/PROPIETARIO crean, editan, eliminan y ordenan con botones Subir/Bajar, utilizables por teclado. El orden enviado contiene todos los IDs de la comunidad. `INVALID_ORDER` exige recargar; no se presenta el orden local como guardado.

Tipos ofrecidos: Texto y Voz. Un canal `VIDEO` creado antes (o por API) se etiqueta Voz, abre el mismo panel de llamada y al editarlo se guarda como `VOZ` (ver [comunidades.md](comunidades.md)).

Eliminar exige confirmación. Crear/editar bloquean envíos repetidos y conservan borradores ante error. El tipo se elige solo al crear; al editar se muestra fijo ("El tipo no se puede cambiar después de crearlo.").

El formulario Permisos consulta acceso, catálogo de roles e integrantes al abrir. Muestra globales en públicos y excepciones por rol/persona en ambos tipos. La excepción individual reemplaza la herencia, incluso vacía. No permite cambiar la privacidad. Ver [modelo granular](roles-permisos.md).

El guardado reemplaza la configuración completa y admite hasta 50 entradas. Los permisos de otro tipo se conservan configurados aunque no sean efectivos. No se asignan roles ni moderación desde este formulario.

`useChannels` consume `channel:created`, `channel:updated`, `channel:deleted`, `channel:access-lost` y `channels:reordered`. Reconsulta ante reconexión, foco/visibilidad o actualización manual; invalida respuestas anteriores y retira canales borrados/ocultos. Abandonar o perder la comunidad cierra la sección.

Los borradores administrativos se marcan obsoletos ante cambios del canal, desconexión, reconexión o foco; se exige recargar antes de guardar. Un cambio en otro canal no los invalida. Esto no agrega versionado al servidor: dos reemplazos válidos simultáneos mantienen semántica de última escritura. `MEMBER_NOT_FOUND` solicita renovar integrantes.

## Chat de canales

`useChannelMessages` registra handlers antes de suscribir y pide el historial después del ack de `channel:subscribe`. Combina HTTP, ack y eventos por ID, incluyendo versiones de edición y marcas de eliminación que impiden recuperar contenido borrado. Las suscripciones/bajas de una misma room se serializan para contemplar A → B → A.

- Historial T-25 y eventos T-26 con múltiples autores, identidad pública, fechas y distinción entre borrado propio/moderado.
- Enviar/editar/eliminar propios requiere ESCRIBIR. Eliminar ajenos exige VER y ELIMINAR_MENSAJES, protegiendo propietario y administradores. No se permite editar ajenos.
- Borradores por canal en memoria; cambiar de canal o fallar el envío los conserva. Salir de la pantalla, recargar o cerrar sesión los elimina. No se guardan en almacenamiento persistente.
- Enter, Shift+Enter y composición de teclado contemplados. Un ack no borra texto nuevo escrito mientras se esperaba.
- Generaciones invalidan HTTP/acks de un canal anterior. Reconexión, foco, permisos, membresía y eventos de perfil revalidan y recuperan la última página. Se descarta la ventana antigua y se pueden volver a cargar anteriores, sin suponer un máximo de eventos perdidos.
- Desconexión retira el contenido; sin conexión puede recuperarse una lectura por HTTP al revalidar, pero no se habilitan escrituras hasta tener suscripción vigente. Revocación, eliminación y abandono retiran el contenido autorizado y bloquean acciones.
- Si falla por red/servidor la lista de integrantes, se conserva lectura sin moderación; errores de autorización retiran el acceso.
- Timeout o error interno provocan reconciliación, sin reenvío automático. No hay idempotencia de comandos: comprobar historial antes de reintentar.

El chat usa la altura disponible y desplaza el historial separado del compositor. En pantallas bajas la página puede desplazarse también. Abrir el catálogo devuelve altura natural; editar datos/permisos reemplaza temporalmente el chat y conserva su borrador. Integrantes abre un panel sobre el historial; Escape cierra y devuelve el foco. La eliminación tiene confirmación y devuelve foco al cancelar.

## Estado global de llamada (F-10/T-36)

`CallProvider` (`context/CallContext.jsx`) se monta en `AppShell`, debajo de las rutas protegidas: sobrevive a la navegación y se desmonta al cerrar sesión, lo que corta la llamada y avisa al backend. Las páginas lo usan con `useCall()` y no llaman a `callsService` ni a `livekit-client`. Hay una sola llamada por pestaña. El contrato HTTP y de LiveKit está en [llamadas.md](llamadas.md).

- Datos: `estado` (`DESCONECTADO`, `CONECTANDO`, `CONECTADO`, `RECONECTANDO`, `SALIENDO`, `ERROR`), `canal`, `error` (`{ code, message, details }`), `misPermisos`, `participantes` (`{ idUsuario, nombre, local, microfono, hablando, camara, video, pantalla, videoPantalla }`), `microfono`, `camara`, `pantalla`, `puedeCompartirPantalla` y `audioBloqueado`.
- Funciones: `entrar(canal, { reemplazar })`, `salir()`, `alternarMicrofono()`, `alternarCamara()`, `alternarPantalla()` y `activarAudio()`.
- `entrar` pone `CONECTANDO`, pide el token con `POST /call/join`, guarda los permisos, crea el `Room`, registra los listeners y recién después conecta. Un segundo `entrar` al mismo canal se ignora; a otro canal sale primero del actual.
- El micrófono no se pide al entrar: solo con `alternarMicrofono()` y si hay HABLAR. Un usuario con solo VER escucha sin que el navegador le pida permisos. Permiso denegado, micrófono ausente u ocupado dejan un `error` con mensaje y la llamada sigue en `CONECTADO`.
- `hablando` viene de la detección de actividad de LiveKit, no del micrófono abierto.
- Audio remoto: cada track de audio se adjunta a un contenedor oculto del provider y se quita al salir. Si el navegador bloquea la reproducción, `audioBloqueado` es `true` y `activarAudio()` la destraba desde un clic.
- Errores del join: `409 ALREADY_IN_CALL` deja `ERROR`; `entrar(canal, { reemplazar: true })` hace `leave` del canal de `details[0].idCanal` y vuelve a entrar. `503 MEDIA_UNAVAILABLE`, red o falla de conexión a LiveKit dejan `ERROR` y se puede reintentar. El chat de texto no depende de este provider.
- Reconexión: los cortes cortos los resuelve el SDK (`RECONECTANDO` → `CONECTADO`). Si el SDK se desconecta por otra razón, se pide un token nuevo y se reintenta una vez; si falla, `ERROR`. Si LiveKit lo saca de la sala, la identidad se duplica en otra pestaña o la sala se borra, queda en `ERROR` sin reconectar ni llamar a `leave`.
- `salir()` y el desmontaje cortan la conexión (LiveKit detiene los tracks propios), quitan listeners y audios, y llaman a `POST /call/leave`. Una respuesta tardía de un `entrar` cancelado se descarta y libera en el backend.

## Interfaz de voz (F-10/T-37)

`CallPanel` reemplaza el aviso de llamadas futuras en los canales VOZ y VIDEO. `ActiveCallBar` vive dentro del `main` de `AppShell`, fija arriba, y aparece en cualquier ruta mientras haya una llamada (o una llamada interrumpida), salvo en la ruta del propio canal.

- Participantes: `useCallParticipants(idCanal)` se suscribe al canal (`channel:subscribe`, alcanza con VER), pide `GET /call/participants` y aplica `call:participant-joined` y `call:participant-left`. Al reconectar el socket vuelve a suscribir y pedir la lista. Se ve quién está aunque uno no haya entrado.
- Dentro de la llamada, cada participante del back se cruza por `idUsuario` con los de LiveKit para agregar "Hablando" (actividad real de audio) y "Silenciado" (micrófono cerrado). Son indicadores separados: un micrófono abierto en silencio no figura como hablando. Si LiveKit tiene a alguien que el back todavía no confirmó por webhook, también se muestra.
- Controles: Unirse (o "Cambiar a esta llamada" si está en otra), micrófono, Activar audio y Salir. El micrófono aparece solo con HABLAR en los permisos vigentes del canal y en los de la llamada, y queda deshabilitado mientras no esté `CONECTADO`. Sin HABLAR se avisa que es solo recepción.
- Estados: `CONECTANDO` y `RECONECTANDO` tienen texto propio en un `role=status`. `ERROR` muestra el mensaje en `role=alert` con "Reintentar"; para `ALREADY_IN_CALL` ofrece "Salir de la otra llamada y unirme". Si LiveKit lo saca de la sala (pérdida de permisos o ingreso desde otro lugar), la barra muestra la llamada interrumpida con "Cerrar".
- La política de listado es la del backend: alguien aparece cuando LiveKit confirma su conexión y desaparece al salir, desconectarse o en la reconciliación de 60 s.
- Estilos en `styles/calls.css`: foco visible heredado, controles de 44 px, indicador de habla con borde y etiqueta de texto (no solo color) y botones a ancho completo en móvil.

## Cámara (F-10/T-38)

- `alternarCamara()` publica o apaga la cámara solo si tiene CAMARA (o el alias histórico TRANSMITIR); el micrófono se controla aparte y no cambia. El botón aparece en el panel y en la barra solo con CAMARA vigente.
- Apagarla (o salir) detiene la captura: LiveKit para el track de cámara al silenciarlo y al desconectar, y se apaga la luz del dispositivo.
- Permiso denegado, cámara ausente u ocupada, o un `MediaDevicesError` de LiveKit (por ejemplo, la cámara se desconecta) dejan un `error` de cámara y la llamada y el audio siguen.
- Cada participante expone `video`: el track de cámara si está encendida y no silenciada. `VideoGrid` aparece cuando al menos uno tiene video y muestra una tarjeta por participante con nombre, "(vos)" y "sin cámara". La propia se ve espejada.
- Los `<video>` van siempre `muted`: el audio se reproduce una sola vez desde el contenedor oculto del provider. El contexto no adjunta ni quita tracks de video; cada tarjeta hace `attach` al montarse y `detach` al desmontarse o cambiar de track.
- Sin CAMARA se recibe el video de los demás (alcanza VER), pero no se puede publicar: el token no incluye la fuente cámara.
- La grilla usa `auto-fit` con mínimo de 220 px y relación 16:9, así que en móvil queda una columna y se reacomoda al entrar o salir gente.

## Compartir pantalla (F-10/T-39)

- `alternarPantalla()` exige PANTALLA en los permisos de la llamada y llama a `setScreenShareEnabled(true, { audio: true })` desde el clic, que abre el selector del navegador. El backend también lo controla: el token solo incluye las fuentes de pantalla con PANTALLA, así que un cliente alterado no puede publicarla.
- La pantalla es una fuente aparte de la cámara: se pueden tener las dos, y micrófono y cámara siguen con sus propios botones. En la grilla, la pantalla ocupa el ancho completo arriba, sin recortar, con la etiqueta "Pantalla de …". En la lista aparece "Compartiendo pantalla".
- Detener: desde el botón del panel, desde la barra ("Dejar de compartir", visible solo mientras se comparte) o desde el aviso del navegador. En ese último caso LiveKit despublica el track al terminar y el estado se actualiza con `LocalTrackUnpublished`; los demás reciben `TrackUnpublished`.
- Cancelar el selector (`NotAllowedError` sin "system") no muestra error ni transmisión. Un bloqueo del sistema operativo, la falta de pantallas o cualquier otra falla deja un `error` de pantalla y la llamada sigue.
- Si el navegador no tiene `getDisplayMedia` (celulares), `puedeCompartirPantalla` es `false`: el panel explica que hay que usar una computadora y no muestra el botón.
- El audio del sistema se pide pero es opcional. Si el navegador no lo da, se comparte solo la imagen sin error. Cuando llega, se reproduce una sola vez como el resto del audio.

Matriz de compatibilidad (según la documentación de cada navegador; confirmar en el recorrido manual):

| Navegador | Pantalla y ventana | Pestaña | Audio del sistema |
| --- | --- | --- | --- |
| Chrome y Edge de escritorio | Sí | Sí | Pestaña; pantalla completa solo en Windows |
| Firefox de escritorio | Sí | No | No |
| Safari en macOS | Sí | No | No |
| Chrome en Android, Safari en iOS | No (se explica en el panel) | No | No |

### Recorrido manual con tres participantes

Requiere las claves de LiveKit en `apps/backend/.env` (`GET /api/media/health` en `{ "disponible": true }`) y, para la lista de participantes, el webhook de LiveKit apuntando al backend (ver [llamadas.md](llamadas.md)). Fuera de `localhost` el navegador exige HTTPS para el micrófono.

1. Tres cuentas en tres navegadores o dispositivos, con un canal de voz público y una cuenta con solo VER (canal privado con habilitación VER).
2. Abrir el canal sin unirse: el navegador no pide micrófono y la lista muestra a los que ya están.
3. Unirse con las tres. La de solo VER entra sin pedido de permisos y no ve el botón de micrófono.
4. Activar micrófono en dos cuentas y hablar por turnos: "Hablando" sigue a quien habla, no a quien tiene el micrófono abierto. Silenciar muestra "Silenciado" en los demás.
5. Navegar a Amigos durante la llamada: la barra sigue visible, el audio no se corta y "Volver al canal" regresa.
6. Salir desde la barra: los demás ven la salida sin recargar. Cerrar la pestaña de otro participante: desaparece al llegar el webhook.
7. Con CAMARA, encender y apagar la cámara: los demás la ven aparecer y desaparecer sin recargar y la luz se apaga. Una cuenta sin CAMARA ve el video pero no tiene botón de cámara. Abrir la cámara en otra app y encenderla en Dialo: aparece el error y el audio sigue.
8. Con PANTALLA, compartir pantalla: los demás la ven sin recargar y figura "Compartiendo pantalla". Cancelar el selector no cambia nada. Detener desde el aviso del navegador y desde la barra estando en otra página: los receptores dejan de verla. Probar desde un celular: aparece la explicación.
9. Denegar el micrófono en el navegador: aparece el error y la llamada sigue. Cortar la red unos segundos: "Reconectando…" y vuelta a "Estás en la llamada."
10. Repetir con teclado y a 360 px de ancho, con tres cámaras encendidas y una pantalla compartida.

## Pruebas

Desde la raíz:

```sh
npm ci
npm run test -w apps/frontend
npm run build -w apps/frontend
```

La suite usa Vitest, Testing Library y jsdom; simula HTTP/sockets y no requiere backend ni base. Cubre privados, comunidades, invitaciones, canales, permisos, paginación, carreras, reconexión, deduplicación, limpieza, borradores y controles de moderación. T-27 quedó validada con 176 tests en 15 archivos; el número puede variar al agregar casos.

Durante T-27 se comprobó además React + Express + Prisma + Socket.IO en Chromium con varias pestañas, usando una base PGlite efímera de una conexión, sin Neon compartido. Se revisaron 320, 390, 736, 1024, 1366 y 1920 px. Esa ejecución no es un script de navegador incluido en el repo ni acredita concurrencia de PostgreSQL nativo. Las suites reproducibles del backend están en [test/README.md](../apps/backend/test/README.md).

Los controles incluyen etiquetas, foco visible, teclado, estados y enlace para saltar al contenido. No se declara una auditoría completa de accesibilidad.

## Recorrido manual integrado

1. Configurar entorno según [README](../README.md), con `VITE_DEV_USER_ID` vacío. Generar Prisma y ejecutar `npm run dev`.
2. Usar ventana normal y privada para dos cuentas distintas; dos pestañas normales comparten la misma cookie/sesión.
3. Registrar/iniciar sesión, editar perfil/foto/disponibilidad y buscar al otro usuario en Amigos. Enviar y aceptar solicitud; comprobar las otras pestañas.
4. Abrir Conversar en ambas cuentas; enviar, editar y confirmar/cancelar eliminación propia. Recargar y verificar persistencia, orden y paginación con más de 30 mensajes.
5. Eliminar amistad: conservar historial y bloquear nuevos envíos; aceptar otra vez recupera escritura. El perfil se notifica a amigos actuales, sin prometer avisos después de eliminar amistad.
6. Crear comunidad; comprobar aparición en otra pestaña de la misma cuenta. Editar nombre/tipo/imagen y cancelar/confirmar según corresponda en una comunidad descartable.
7. Crear y copiar invitación, abrirla desde otra sesión, consultar previa sin ingresar y aceptar. Probar el destino pendiente desde login/registro, vencimiento, revocación y usos.
8. Ver integrantes y abandonar con una cuenta no propietaria; comprobar cierre de vistas en sus otras pestañas.
9. Crear canales de texto y voz (Video ya no se ofrece), ordenarlos con teclado y editar. Voz muestra el panel de llamada (recorrido en la sección de llamadas). Eliminar solo canales descartables.
10. Configurar un canal privado, habilitar Ver a un integrante y comprobar lectura sin envío. Otorgar Escribir; enviar/editar/eliminar propios y comprobar recepción una sola vez en varias pestañas. Revocar Ver y comprobar retirada del contenido; restaurar y volver a abrir.
11. Con propietario y autor de menor rango, confirmar/cancelar eliminación moderada; no debe existir edición ajena. Para otros roles se puede usar el seed en una base de desarrollo descartable; no hay endpoint para cambiar roles.
12. Cargar historial anterior, alternar rápido de canal y comprobar borradores. Detener/reiniciar backend; comprobar conservación de texto y recuperación de historial/permisos. Revisar el resultado de un envío sin ack antes de reintentar.
13. Repetir por teclado y a ancho móvil; comprobar navegación, compositor y cierre de integrantes con Escape.
14. Cerrar sesión limpia la pestaña actual. Los escenarios de desconexión proactiva de otras sesiones y de falla inicial de red deben validarse como parte de T-15 cuando se integre.

La latencia de mensajes observada en la instancia del equipo sigue pendiente de medición; no se declara optimizada por el rediseño visual. Los retoques visuales posteriores quedan fuera de esta revisión documental.

## Administración de roles e integrantes (F-09/T-32)

Desde una comunidad, **Roles** muestra los roles base protegidos y el catálogo personalizado. Propietario y administradores pueden crear, renombrar o eliminar roles personalizados. La confirmación de borrado explica que se revocan sus asignaciones y habilitaciones por canal, sin expulsar integrantes.

En **Integrantes** se gestionan rol base, personalizados, expulsión y baneo según capacidades. Un administrador puede otorgar ADMIN; solo el propietario puede modificar a otro administrador. Moderador no aparece como opción. No se puede modificar la propia membresía.

El catálogo usa las rutas de T-29 y el editor envía `PATCH /api/communities/:id/members/:idUsuario` de T-30. Envía solo los campos editados; `idsRoles: []` quita todas las asignaciones personalizadas. Los eventos de catálogo y membresía, la reconexión y el regreso a la pestaña reconsultan los datos. Si el estado cargado cambia mientras se edita, se bloquea el guardado hasta volver a abrir el formulario. Los errores conservan el borrador y la confirmación aparece después de la respuesta exitosa.

Para probar: crear un rol con permisos, asignarlo, editar sus capacidades y quitarlo; verificar excepciones por rol/usuario, cámara/pantalla independientes y revocación en dos pestañas. Probar que un administrador puede promover y no degradar a otro administrador.

## Permisos y solicitudes de canal

En **Canales → Permisos**, ambos tipos admiten excepciones por rol y usuario. Los públicos también muestran globales; los privados requieren habilitación explícita. La excepción individual reemplaza la herencia.

Todos los integrantes ven el catálogo; un canal bloqueado abre una pantalla sin mensajes, buscador ni llamada. Si es privado, ofrece Solicitar acceso, estado Pendiente o Volver a solicitar tras rechazo. El propietario/admin revisa la cola desde **Solicitudes**, elige permisos antes de aceptar o rechaza. También puede habilitar personas directamente desde Permisos. Los cambios y la reconexión recargan el catálogo y la cola.

La creación define los permisos públicos iniciales y los guarda junto al canal, en una sola operación. Texto usa Ver/Escribir; voz Ver/Hablar/Cámara/Pantalla. Admin y propietario mantienen todos los permisos.

## Baneo de integrantes (T-41)

En **Integrantes**, propietario, administradores y moderadores ven la acción **Banear** junto a los miembros con un rol base inferior al suyo. La confirmación admite un motivo opcional. **Ver baneos** abre la lista autorizada y permite levantar un baneo con confirmación. Quien pierde acceso vuelve al listado de comunidades desde la pantalla activa y recibe un aviso. Si abre una invitación válida durante el baneo, ve que su acceso está bloqueado; el motivo queda reservado al equipo autorizado.


## Integración del kanban

La integración del tablero de interfaz incorpora búsqueda completa, adjuntos, actividad, perfil y llamadas privadas. Ver [contratos, migraciones, alcance y verificación](kanban-integracion.md).

## Rendimiento y estilos base

- **Historial de mensajes:** cada mensaje está memorizado (`memo`) y la lista se arma con `useMemo`, así escribir en el campo no vuelve a dibujar el historial. `mergeMessages` agrega al final sin reordenar cuando llega un mensaje nuevo, y el indicador de «escribiendo» solo actualiza el estado cuando alguien deja de escribir.
- **Mensajes anteriores:** se piden solos cuando el botón «Cargar anteriores» se acerca a la vista (`useAutoOlder`); el botón queda para teclado. La posición se conserva midiendo la distancia al último mensaje (`distanciaAlFinal`), porque el historial usa una columna invertida.
- **Lista de conversaciones:** se actualiza con los eventos del socket; ya no se vuelve a pedir entera después de cada mensaje enviado.
- **Lateral:** el sondeo de actividad de comunidades se saltea con la pestaña oculta y el refresco al volver a la pestaña es como mucho cada 15 segundos.
- **Estilos base:** los elementos sin clase propia (`button`, `input`, `select`, títulos) usan los botones, campos y la tipografía de Dialo; no hace falta estilarlos uno por uno para que no queden con el aspecto del navegador.
- **Vidrio líquido:** `.win` y las superficies flotantes (diálogos, avisos, paneles) usan desenfoque con saturación, borde con brillo y un fondo con luz de color detrás (`.shell::before`) para que el vidrio se note.

### T-42: centro de actividad y avisos de seguridad

Se reutilizan el panel, las filas, los avisos flotantes, la tipografía y los estilos actuales del centro de actividad. Los nuevos avisos no incorporan otra paleta ni otro sistema de componentes.

Además de mensajes y solicitudes, aparecen cambios de roles, restricciones de permisos, baneos y levantamientos de baneo. Los cambios de roles incluyen asignaciones, eliminación de un rol asignado y transferencia de propiedad. Las restricciones de canal se generan cuando se pierde algún permiso efectivo; repetir una configuración sin cambios no duplica avisos. Se respeta la preferencia de silenciar notificaciones.

Los avisos de baneo y rehabilitación siempre son genéricos: no muestran comunidad, motivo, autor ni enlace. Levantar un baneo no restaura la membresía. Los avisos de roles o permisos muestran el destino únicamente mientras el usuario conserve acceso. Sin acceso, «Entendido» marca la lectura sin navegar. Antes de abrir un destino se revalida su autorización por HTTP; un destino eliminado o revocado mantiene el panel con una explicación.

Al recibir revocaciones, salidas, cambios o eliminaciones se descartan datos y avisos flotantes anteriores, se cierran avisos del navegador y se reconsulta. Una respuesta de paginación anterior no puede restaurar contenido retirado. La reconexión recupera el estado persistido y la lectura se sincroniza entre pestañas.

Recorrido manual con dos usuarios y dos pestañas del destinatario:

1. Cambiar su rol y comprobar el aviso en la campana, abrir integrantes y verificar el rol vigente.
2. Restringir un canal: debe desaparecer el aviso previo de sus mensajes y quedar un aviso genérico si se pierde VER. Si conserva VER, puede abrir el canal y consultar los permisos actuales.
3. Banear y levantar el baneo: ambos avisos carecen de nombres privados y navegación; no se recupera automáticamente la membresía.
4. Leer un aviso en una pestaña y comprobar el contador en la otra; recargar y reconectar sin duplicados.
5. Eliminar un destino o revocar acceso antes de pulsar un aviso: no se debe abrir una pantalla bloqueada ni conservar su vista previa flotante.

### Ajuste visual y permisos de T-42

El centro de notificaciones reemplaza temporalmente la búsqueda, filtros y lista de la barra lateral. Conserva la cabecera, el perfil y los materiales visuales actuales. No utiliza modal, backdrop ni desenfoque del contenido. Escape, la cruz o abrir un destino cierran el panel y recuperan la navegación; el foco vuelve al disparador al cerrar. En pantallas pequeñas el panel ocupa la vista lateral y permite regresar al contenido.

Los públicos parten de permisos globales y suman los roles heredados íntegros. En privados se admiten personas y se resuelven solicitudes por administración. La creación pública permite elegir los valores iniciales. Propietario y administradores siempre tienen acceso completo.

Los avisos de `solicitud_canal` aparecen solo al equipo administrador mientras el pedido esté pendiente. Abrirlos revalida la autoridad y abre el panel de Solicitudes del canal. El solicitante recibe `acceso_aceptado` o `acceso_rechazado`; si ya perdió acceso, no se conserva contexto privado ni enlace al contenido. El panel lateral de notificaciones mantiene su comportamiento de foco, lectura y sincronización entre pestañas.

La privacidad queda fija al crear el canal. El formulario de permisos no ofrece un checkbox ni un switch para convertir públicos/privados. En privados tampoco duplica el botón de gestionar solicitudes: la cola se abre únicamente desde el apartado **Solicitudes** del canal o desde su aviso autorizado.

## Ajustes de roles e interfaz

[Contrato granular](roles-permisos.md). Moderador se retira; Roles permite elegir capacidades y pedir una propuesta de IA revisable. El catálogo y la gestión de integrantes se habilitan según `misPermisos`, sin conceder privilegios por controles del cliente.

Los avisos de éxito se publican mediante SystemToasts, centrados sin ocupar espacio de página. Informativos, errores y avisos de llamada usan la misma salida Toast; Notice publica sin reservar espacio. Los permisos se editan desde arriba, reemplazando el cuerpo del canal. Los adjuntos usan AttachmentCard con MIME validado y vista previa de imágenes/videos, sin nombre de archivo en el historial. La carga requiere elegir tipo, revisar la vista previa y confirmar el envío. Los controles de avisos del navegador y silencio están en Ajustes; ActivityCenter conserva listado y lectura. CallContext aplica en vivo las actualizaciones de fuentes y cierra la llamada al perder acceso.

## Armonía de llamadas, chat y permisos

Ver [implementación, límites y recorrido manual](armonia-interfaz.md). Los adjuntos están integrados al compositor con visor completo y videos de hasta 2 MiB. Las llamadas comparten barra sin desplegable. Ajustes de canal reúne las acciones y el resumen de comunidad muestra cantidades. El lateral permite archivar/silenciar o quitar una conversación, con contadores por destino y marcadores de llamada.

## Pulido posterior a armonía

Ver [cambios y verificaciones](pulido-interfaz.md). Se retira Dispositivos del perfil y la lista de integrantes del chat; se corrigen menús únicos, espaciado de pestañas, vistas móviles y la sincronización de participantes.

## Adjuntos múltiples y optimización de cargas

El menú de adjuntos permite preparar hasta seis recursos con un texto y confirmarlos juntos. Los registros de llamadas son inmutables. Las rutas de administración y el SDK de llamadas se descargan cuando se necesitan; la actividad lateral agrupa eventos y revalida destinos específicos. Ver [análisis, cambios y mediciones](ajustes-rendimiento.md).

## Borradores, lectura, galería y formularios

Ver [experiencia de chat y verificación](experiencia-chat.md). Los borradores viven en la sesión del shell; la lectura respeta el scroll y las subidas ofrecen progreso/cancelación. Los reintentos recuperan recibos confirmados. La galería recorre recursos ya cargados y los formularios usan una confirmación común al abandonar cambios. Las tipografías se sirven desde public/fonts, con Archivo diferido a la landing.

## Álbumes y adaptación de recursos

Ver [agrupación, acciones y verificación](albumes-adjuntos.md). Los envíos de cuatro a seis recursos se muestran como mosaicos por identificador de envío. La vista previa respeta proporciones y los recursos solo admiten eliminación, con validación también en el servidor.

## Menú contextual de mensajes

Ver [acciones, permisos y validación](menu-mensajes.md). Los tres puntos reúnen responder, reacciones, copiar, fijar y las acciones existentes de edición/eliminación. Las respuestas se componen con cita y los fijados tienen un listado independiente del historial cargado.

## Burbujas y fijados compactos

Ver [estructura, navegación y validación](burbujas-fijados.md). Cada mensaje reúne sus elementos en una burbuja; el acceso al último mensaje tiene una fila propia y los fijados aparecen bajo la cabecera, con vista previa y navegación al original.
