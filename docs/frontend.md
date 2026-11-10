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
| `/comunidades/:id/invitaciones` | Administración de invitaciones para MODERADOR o superior |
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

Los estilos son `styles.css`, `styles-chat.css`, `styles-communities.css`, `styles-channels.css`, `styles-workspace.css` y `styles-sidebar.css`. Usan variables compartidas, fuentes del sistema y fallbacks monoespaciados; no requieren una biblioteca visual ni fuentes remotas.

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

Eliminar exige confirmación. Crear/editar bloquean envíos repetidos y conservan borradores ante error. `CHANNEL_HAS_MESSAGES` impide convertir TEXTO a VOZ/VIDEO si hay cualquier mensaje, incluidos los eliminados lógicamente.

El formulario Permisos consulta `/channels/:id/access` y la lista de integrantes solo al abrirlo. Permite canal privado, habilitaciones MODERADOR/INTEGRANTE y usuarios individuales. Escribir/Hablar/Transmitir implica Ver; quitar una habilitación no deniega lo concedido por otra vía. Los públicos conservan sus defaults; para solo lectura se configura privado y Ver. ADMIN/PROPIETARIO conservan todos los permisos aplicables.

El guardado reemplaza la configuración completa y admite hasta 50 entradas. Los permisos de otro tipo se conservan configurados aunque no sean efectivos. No se asignan roles ni moderación desde este formulario.

`useChannels` consume `channel:created`, `channel:updated`, `channel:deleted`, `channel:access-lost` y `channels:reordered`. Reconsulta ante reconexión, foco/visibilidad o actualización manual; invalida respuestas anteriores y retira canales borrados/ocultos. Abandonar o perder la comunidad cierra la sección.

Los borradores administrativos se marcan obsoletos ante cambios del canal, desconexión, reconexión o foco; se exige recargar antes de guardar. Un cambio en otro canal no los invalida. Esto no agrega versionado al servidor: dos reemplazos válidos simultáneos mantienen semántica de última escritura. `MEMBER_NOT_FOUND` solicita renovar integrantes.

## Chat de canales

`useChannelMessages` registra handlers antes de suscribir y pide el historial después del ack de `channel:subscribe`. Combina HTTP, ack y eventos por ID, incluyendo versiones de edición y marcas de eliminación que impiden recuperar contenido borrado. Las suscripciones/bajas de una misma room se serializan para contemplar A → B → A.

- Historial T-25 y eventos T-26 con múltiples autores, identidad pública, fechas y distinción entre borrado propio/moderado.
- Enviar y editar propios requieren `ESCRIBIR`; eliminar propios también. Eliminar ajenos exige `VER`, rol MODERADOR o superior y jerarquía estrictamente mayor a la del autor actual. Si el autor abandonó, su rango es cero. No se ofrece editar mensajes ajenos.
- Borradores por canal en memoria; cambiar de canal o fallar el envío los conserva. Salir de la pantalla, recargar o cerrar sesión los elimina. No se guardan en almacenamiento persistente.
- Enter, Shift+Enter y composición de teclado contemplados. Un ack no borra texto nuevo escrito mientras se esperaba.
- Generaciones invalidan HTTP/acks de un canal anterior. Reconexión, foco, permisos, membresía y eventos de perfil revalidan y recuperan la última página. Se descarta la ventana antigua y se pueden volver a cargar anteriores, sin suponer un máximo de eventos perdidos.
- Desconexión retira el contenido; sin conexión puede recuperarse una lectura por HTTP al revalidar, pero no se habilitan escrituras hasta tener suscripción vigente. Revocación, eliminación y abandono retiran el contenido autorizado y bloquean acciones.
- Si falla por red/servidor la lista de integrantes, se conserva lectura sin moderación; errores de autorización retiran el acceso.
- Timeout o error interno provocan reconciliación, sin reenvío automático. No hay idempotencia de comandos: comprobar historial antes de reintentar.

El chat usa la altura disponible y desplaza el historial separado del compositor. En pantallas bajas la página puede desplazarse también. Abrir el catálogo devuelve altura natural; editar datos/permisos reemplaza temporalmente el chat y conserva su borrador. Integrantes abre un panel sobre el historial; Escape cierra y devuelve el foco. La eliminación tiene confirmación y devuelve foco al cancelar.

## Estado global de llamada (F-10/T-36)

`CallProvider` (`context/CallContext.jsx`) se monta en `AppShell`, debajo de las rutas protegidas: sobrevive a la navegación y se desmonta al cerrar sesión, lo que corta la llamada y avisa al backend. Las páginas lo usan con `useCall()` y no llaman a `callsService` ni a `livekit-client`. Hay una sola llamada por pestaña. El contrato HTTP y de LiveKit está en [llamadas.md](llamadas.md).

- Datos: `estado` (`DESCONECTADO`, `CONECTANDO`, `CONECTADO`, `RECONECTANDO`, `SALIENDO`, `ERROR`), `canal`, `error` (`{ code, message, details }`), `misPermisos`, `participantes` (`{ idUsuario, nombre, local, microfono, hablando, camara, video }`), `microfono`, `camara` y `audioBloqueado`.
- Funciones: `entrar(canal, { reemplazar })`, `salir()`, `alternarMicrofono()`, `alternarCamara()` y `activarAudio()`.
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
- Estilos en `styles-calls.css`: foco visible heredado, controles de 44 px, indicador de habla con borde y etiqueta de texto (no solo color) y botones a ancho completo en móvil.

## Cámara (F-10/T-38)

- `alternarCamara()` publica o apaga la cámara solo si los permisos de la llamada incluyen TRANSMITIR; el micrófono se controla aparte y no cambia. El botón aparece en el panel y en la barra solo con TRANSMITIR vigente.
- Apagarla (o salir) detiene la captura: LiveKit para el track de cámara al silenciarlo y al desconectar, y se apaga la luz del dispositivo.
- Permiso denegado, cámara ausente u ocupada, o un `MediaDevicesError` de LiveKit (por ejemplo, la cámara se desconecta) dejan un `error` de cámara y la llamada y el audio siguen.
- Cada participante expone `video`: el track de cámara si está encendida y no silenciada. `VideoGrid` aparece cuando al menos uno tiene video y muestra una tarjeta por participante con nombre, "(vos)" y "sin cámara". La propia se ve espejada.
- Los `<video>` van siempre `muted`: el audio se reproduce una sola vez desde el contenedor oculto del provider. El contexto no adjunta ni quita tracks de video; cada tarjeta hace `attach` al montarse y `detach` al desmontarse o cambiar de track.
- Sin TRANSMITIR se recibe el video de los demás (alcanza VER), pero no se puede publicar: el token no incluye la fuente cámara.
- La grilla usa `auto-fit` con mínimo de 220 px y relación 16:9, así que en móvil queda una columna y se reacomoda al entrar o salir gente.

### Recorrido manual con tres participantes

Requiere las claves de LiveKit en `apps/backend/.env` (`GET /api/media/health` en `{ "disponible": true }`) y, para la lista de participantes, el webhook de LiveKit apuntando al backend (ver [llamadas.md](llamadas.md)). Fuera de `localhost` el navegador exige HTTPS para el micrófono.

1. Tres cuentas en tres navegadores o dispositivos, con un canal de voz público y una cuenta con solo VER (canal privado con habilitación VER).
2. Abrir el canal sin unirse: el navegador no pide micrófono y la lista muestra a los que ya están.
3. Unirse con las tres. La de solo VER entra sin pedido de permisos y no ve el botón de micrófono.
4. Activar micrófono en dos cuentas y hablar por turnos: "Hablando" sigue a quien habla, no a quien tiene el micrófono abierto. Silenciar muestra "Silenciado" en los demás.
5. Navegar a Amigos durante la llamada: la barra sigue visible, el audio no se corta y "Volver al canal" regresa.
6. Salir desde la barra: los demás ven la salida sin recargar. Cerrar la pestaña de otro participante: desaparece al llegar el webhook.
7. Con TRANSMITIR, encender y apagar la cámara: los demás la ven aparecer y desaparecer sin recargar y la luz se apaga. Una cuenta sin TRANSMITIR ve el video pero no tiene botón de cámara. Abrir la cámara en otra app y encenderla en Dialo: aparece el error y el audio sigue.
8. Denegar el micrófono en el navegador: aparece el error y la llamada sigue. Cortar la red unos segundos: "Reconectando…" y vuelta a "Estás en la llamada."
9. Repetir con teclado y a 360 px de ancho, con tres cámaras encendidas.

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
9. Crear canales de texto/voz/video, ordenarlos con teclado y editar. Voz/video muestran el panel de llamada (recorrido en la sección de llamadas). Eliminar solo canales descartables.
10. Configurar un canal privado, habilitar Ver a un integrante y comprobar lectura sin envío. Otorgar Escribir; enviar/editar/eliminar propios y comprobar recepción una sola vez en varias pestañas. Revocar Ver y comprobar retirada del contenido; restaurar y volver a abrir.
11. Con propietario y autor de menor rango, confirmar/cancelar eliminación moderada; no debe existir edición ajena. Para otros roles se puede usar el seed en una base de desarrollo descartable; no hay endpoint para cambiar roles.
12. Cargar historial anterior, alternar rápido de canal y comprobar borradores. Detener/reiniciar backend; comprobar conservación de texto y recuperación de historial/permisos. Revisar el resultado de un envío sin ack antes de reintentar.
13. Repetir por teclado y a ancho móvil; comprobar navegación, compositor y cierre de integrantes con Escape.
14. Cerrar sesión limpia la pestaña actual. Los escenarios de desconexión proactiva de otras sesiones y de falla inicial de red deben validarse como parte de T-15 cuando se integre.

La latencia de mensajes observada en la instancia del equipo sigue pendiente de medición; no se declara optimizada por el rediseño visual. Los retoques visuales posteriores quedan fuera de esta revisión documental.

## Administración de roles e integrantes (F-09/T-32)

Desde una comunidad, **Roles** muestra los roles base protegidos y el catálogo personalizado. Propietario y administradores pueden crear, renombrar o eliminar roles personalizados. La confirmación de borrado explica que se revocan sus asignaciones y habilitaciones por canal, sin expulsar integrantes.

En **Integrantes**, cada persona muestra su rol base y sus roles personalizados. **Editar roles** aparece únicamente para integrantes de menor jerarquía y nunca para la cuenta propia. El propietario puede otorgar Administrador; un administrador puede otorgar Moderador o Integrante. El formulario permite seleccionar varios roles personalizados o quitar todos. El backend sigue validando las operaciones.

El catálogo usa las rutas de T-29 y el editor envía `PATCH /api/communities/:id/members/:idUsuario` de T-30. Envía solo los campos editados; `idsRoles: []` quita todas las asignaciones personalizadas. Los eventos de catálogo y membresía, la reconexión y el regreso a la pestaña reconsultan los datos. Si el estado cargado cambia mientras se edita, se bloquea el guardado hasta volver a abrir el formulario. Los errores conservan el borrador y la confirmación aparece después de la respuesta exitosa.

Para probar: crear, renombrar y eliminar un rol; asignar dos roles y después quitar ambos; verificar que un administrador no pueda promover a Administrador, editar a un par ni editarse. En dos pestañas, cambiar los roles desde una y comprobar que la otra recargue la lista y bloquee un editor abierto con datos viejos. Los permisos personalizados por canal se administran desde Canales (T-33).

## Permisos por canal para roles personalizados (F-09/T-33)

En **Canales → Permisos**, propietario y administradores pueden agregar un rol del catálogo de la comunidad, marcar los permisos aplicables y quitar su habilitación. El formulario conserva las habilitaciones de roles base e integrantes no editadas. Al agregar un rol se activa Ver; activar otro permiso también implica Ver. Quitar Ver elimina la habilitación del destinatario. Los permisos guardados para otro tipo de canal se conservan mientras no se quite la habilitación.

Para probar, usá una cuenta con el rol personalizado que no sea propietaria ni administradora. En tres canales privados, habilitá respectivamente Ver y Escribir, solo Ver y ninguna habilitación. Verificá que esa cuenta pueda escribir en el primero, leer en el segundo y no vea el tercero, siempre que no reciba permisos de otra fuente. En canales públicos el rol agrega permisos a los valores por defecto; no puede denegarlos.

Los eventos de edición del canal, cambios del catálogo, salida de integrantes y reconexión invalidan un formulario abierto. Recargar el formulario descarta el borrador y obtiene los datos vigentes. Si el servidor rechaza un rol o integrante que ya no existe, se pide recargar sin anunciar éxito. El reemplazo de acceso usa el contrato existente de T-31; la interfaz detecta cambios notificados, sin un control de versión atómico en el servidor.


## Baneo de integrantes (T-41)

En **Integrantes**, propietario, administradores y moderadores ven la acción **Banear** junto a los miembros con un rol base inferior al suyo. La confirmación admite un motivo opcional. **Ver baneos** abre la lista autorizada y permite levantar un baneo con confirmación. Quien pierde acceso vuelve al listado de comunidades desde la pantalla activa y recibe un aviso. Si abre una invitación válida durante el baneo, ve que su acceso está bloqueado; el motivo queda reservado al equipo autorizado.
