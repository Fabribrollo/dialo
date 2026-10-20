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

No hay explorador público, ingreso directo, edición de roles, transferencia ni expulsión en esta interfaz. Los canales de voz y video muestran su tipo y configuración, sin llamadas.

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
9. Crear canales de texto/voz/video, ordenarlos con teclado y editar. Voz/video no deben mostrar conexión de llamada. Eliminar solo canales descartables.
10. Configurar un canal privado, habilitar Ver a un integrante y comprobar lectura sin envío. Otorgar Escribir; enviar/editar/eliminar propios y comprobar recepción una sola vez en varias pestañas. Revocar Ver y comprobar retirada del contenido; restaurar y volver a abrir.
11. Con propietario y autor de menor rango, confirmar/cancelar eliminación moderada; no debe existir edición ajena. Para otros roles se puede usar el seed en una base de desarrollo descartable; no hay endpoint para cambiar roles.
12. Cargar historial anterior, alternar rápido de canal y comprobar borradores. Detener/reiniciar backend; comprobar conservación de texto y recuperación de historial/permisos. Revisar el resultado de un envío sin ack antes de reintentar.
13. Repetir por teclado y a ancho móvil; comprobar navegación, compositor y cierre de integrantes con Escape.
14. Cerrar sesión limpia la pestaña actual. Los escenarios de desconexión proactiva de otras sesiones y de falla inicial de red deben validarse como parte de T-15 cuando se integre.

La latencia de mensajes observada en la instancia del equipo sigue pendiente de medición; no se declara optimizada por el rediseño visual. Los retoques visuales posteriores quedan fuera de esta revisión documental.
