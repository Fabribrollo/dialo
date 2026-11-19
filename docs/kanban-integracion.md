# Integración del kanban de interfaz

Base: `1fdacef` (rediseño integrado). Los identificadores T10–T28 de esta página pertenecen al tablero de Claude, no a la numeración de issues de GitHub.

## Cambios incluidos

| Tarjeta | Implementación |
| --- | --- |
| T10 | Propuesta de canal con IA desde el asistente existente. El backend valida permisos y respuesta estructurada; el usuario revisa y confirma antes de crear. |
| T11 | Se conserva el acceso «Mis comunidades» del filtro Comunidades de la barra lateral, ya implementado. |
| T12 | Llamadas privadas de voz/video entre amigos: entrante, llamando, aceptación, rechazo, cancelación, ocupación y falta de respuesta. La aceptación pertenece a una sesión; otra pestaña no abre medios por su cuenta. Cierre idempotente y mensaje en el historial. |
| T13 | Búsqueda en todo el historial de canales y privados, con paginación y autorización actual. Se presenta separada del filtro de mensajes cargados. |
| T14–T15 | Quitar foto y elegir entre seis colores de avatar persistidos. |
| T16 | Sugerencias de @usuario y resaltado de menciones; indicador de escritura efímero en canales y privados. |
| T17 | Insignia «Moderado con IA» visible para quienes pueden ver el canal. No expone reglas ni habilita su edición. |
| T18 | Adjuntar PDF/PNG/JPG/WebP de hasta 5 MB y consultar los últimos 30 archivos compartidos. Descargas autenticadas con verificación de permisos actuales. |
| T19 | Centro de actividad persistente, contador, paginación y lectura en varias pestañas. Avisos por mensajes y solicitudes de amistad; silenciar nuevos avisos y elegir dispositivos desde el perfil. |
| T20 | Vista breve de la actividad de comunidades: participantes en llamada y último mensaje de un canal autorizado. Actualización periódica y al recuperar foco/conexión o cambiar acceso. |
| T21 | Se conserva la invalidación de sesiones de T-15 y se incorpora un aviso visible al volver al acceso. Las llamadas privadas también terminan al revocar la sesión. |
| T22 | `Retry-After`, segundos restantes y cuenta regresiva en errores de autenticación. Las cuotas de mensajes y archivos siguen activas. |
| T23 | Consulta de disponibilidad del correo antes de continuar el primer paso del registro. No crea una cuenta ni sustituye la unicidad al registrar. |
| T24 | Transferencia de propiedad a otro integrante, con confirmación. El propietario anterior pasa a ADMIN. Solo el propietario actual puede transferir. |
| T25 | Registro paginado de mensajes rechazados por moderación: autor, contenido, motivo y fecha. Solo moderadores, administradores y propietarios lo consultan; configuración de reglas sigue reservada a ADMIN/PROPIETARIO. |
| T26 | Edición del nombre visible de 2–40 caracteres y de información personal hasta 190, coherentes en formulario y API. |
| T27 | Canales TEXTO/VOZ. La migración convierte VIDEO a VOZ conservando identificadores y habilitaciones. Los canales de voz mantienen cámara/pantalla mediante TRANSMITIR. |
| T28 | Presencia calculada con todas las conexiones del usuario. Cerrar una pestaña no lo desconecta si queda otra. La disponibilidad elegida se conserva y el modo invisible no se publica como conectado. |

## Configuración

Mantener la configuración existente de PostgreSQL, sesiones y LiveKit en `apps/backend/.env`.

Para propuestas de canales se requieren `OPENAI_API_KEY` y `OPENAI_GENERATION_MODEL`. El modelo debe admitir Responses con salida estructurada. No se elige un modelo automáticamente. Sin configuración o si el proveedor falla, el formulario permite crear el canal manualmente. La descripción se envía al proveedor; no se envía el historial del chat.

La moderación existente conserva su configuración y comportamiento ante indisponibilidad del proveedor. La insignia indica que la comunidad habilitó moderación, no garantiza que cada mensaje haya sido evaluado por un proveedor disponible.

Los webhooks de LiveKit siguen entrando por el endpoint existente con validación de firma. Las salas privadas usan el prefijo `privada-`. La llamada entrante vence a los 60 segundos; el proceso de reconciliación corre cada 15 segundos y reintenta cierres del proveedor que hayan fallado. No se promete un corte instantáneo cuando el proveedor no responde. Las selecciones de salida de audio dependen del soporte del navegador.

## Migraciones

Aplicar las cinco migraciones nuevas con `npm run db:deploy -w apps/backend`, con los procesos de la app detenidos y comprobando la base apuntada por el `.env`.

1. Perfil y registro de moderación.
2. Unificación de VIDEO en VOZ.
3. Preferencias privadas y notificaciones.
4. Adjuntos.
5. Llamadas privadas.

Coordinar la migración del enum con el equipo: después de aplicarla, un backend anterior que todavía intente crear VIDEO debe actualizarse. No editar migraciones ya aplicadas ni usar `db push` para sustituir este historial. La migración de VIDEO se prueba sobre un esquema anterior con datos y permisos existentes.

## Contratos nuevos

Todas las rutas siguientes usan el prefijo `/api`.

| Método/ruta | Acceso y resultado |
| --- | --- |
| POST `/auth/email-availability` | Público y limitado por IP; `{correo}` → `{disponible}`. |
| DELETE `/users/me/foto` | Sesión; quita la referencia de foto del perfil. |
| PATCH `/users/me/preferences` | Sesión; `silenciarNotificaciones`, `audioInput`, `audioOutput`, `videoInput`. No son datos públicos. |
| GET `/channels/:id/messages/search` | VER; `q` de 2–120 caracteres, `cursor` opcional, `limit` hasta 50. |
| GET `/conversations/:id/messages/search` | Participante del privado; mismo contrato. |
| POST `/communities/:id/channels/suggestion` | ADMIN/PROPIETARIO; `{descripcion,tipo}` → `{propuesta}`. No guarda un canal. |
| POST `/communities/:id/ownership` | Propietario; `{idUsuario}` de otro integrante; 204. |
| GET `/communities/:id/moderation/blocked` | MODERADOR o superior; `cursor` opcional → `{items,nextCursor}`. |
| GET `/communities/:id/activity` | Integrante; filtra los canales por VER actual. Devuelve `participantes`, `ultimoMensaje` y `llamada` (canal con más gente: `idCanal`, `canal`, hasta tres `personas`, `total`, `estoy`). |
| GET `/notifications` | Notificaciones propias y visibles; `{items,noLeidas,nextCursor}`. Cada item trae `contexto` con el nombre del destino (canal y comunidad, persona o quien envió la solicitud) y, si viene de un mensaje, `vista` con autor y los primeros 140 caracteres. |
| POST `/notifications/read` | `{id}` marca una propia; `{tipo,referencia}` marca las de un destino; `{}` marca todas las propias. |
| POST `/files` | Multipart: `tipo` canal/conversacion, `id`, `archivo`. Requiere escritura. |
| GET `/files/shared/:tipo/:id` | Lectura actual del destino; últimos 30 adjuntos no eliminados. |
| GET `/files/:id` | Descarga autenticada; sin cache y como attachment. |
| POST `/private-calls` | Amigos participantes del privado; `{idConversacion,video}` → `{llamada}`. |
| GET `/private-calls/current` | Llamada activa propia o `null`. |
| POST `/private-calls/:id/accept` | Receptor; vincula su sesión y devuelve la llamada. |
| POST `/private-calls/:id/token` | Participante cuya sesión inició/aceptó; credencial de LiveKit, sin permisos de administración. |
| POST `/private-calls/:id/end` | Participante; finalización idempotente, 204. |

Eventos nuevos: `typing:update`/`typing:updated`, `activity:watch`, `notifications:changed`, `private-call:changed` y `community:moderation-changed`. El indicador de escritura no se persiste y caduca a los 4,5 segundos sin renovación. Los eventos no sustituyen la autorización del servidor. Los datos públicos de usuario agregan `colorAvatar` y `enLinea`; el canal agrega `moderacionActiva`.

## Decisiones y límites

- Los archivos pequeños se guardan en PostgreSQL en esta integración. Para uso con alto volumen debe migrarse a almacenamiento de objetos privado y una política de retención; no es un CDN ni un repositorio de archivos ilimitado. Validar la firma de los bytes restringe formatos, pero no constituye un escaneo antivirus.
- Los avisos nuevos aparecen flotando arriba a la derecha (hasta tres, se cierran solos a los 7 segundos y se frenan con el mouse o el foco) y quedan en el panel de la campana. Si la pestaña está en segundo plano y la persona lo activó, se muestran como notificación del navegador.
- Cuando arranca una llamada en una comunidad propia, el lateral muestra una invitación con «Unirme» (se detecta con el sondeo de actividad, cada 30 segundos). La llamada privada entrante aparece oscura, arriba de todo, con tono. Los avisos del sistema (guardado, enlace copiado, reconexión) son pastillas chicas abajo al centro.
- El centro de actividad es interno a la app. No incluye push con la app cerrada, service worker ni notificaciones por email; el único sonido es el tono de la llamada privada entrante, que respeta «silenciar notificaciones». Las menciones se resaltan y generan el aviso normal del canal, sin un contador separado por mención.
- Silenciar omite nuevos avisos; no elimina avisos anteriores. Un destino visible y enfocado en alguna pestaña propia tampoco genera un aviso adicional, y al enfocarlo se marcan como leídos sus avisos anteriores. El listado y contador excluyen destinos cuyo acceso se perdió.
- Los mensajes se entregan antes de procesar notificaciones. Estas tareas posteriores se registran y se drenan en las pruebas; no hay una cola durable/outbox para recuperar un fallo del proceso entre mensaje y aviso.
- La presencia, indicadores de escritura y observación de pestañas viven en memoria de un único backend. Ejecutar múltiples instancias requiere un adaptador compartido y presencia centralizada.
- No hay read receipts por mensaje ni estados de entrega al dispositivo receptor. Las llamadas guardan un resumen en el chat, sin grabación de audio/video.
- El aviso de sesión utiliza el mecanismo existente. No incorpora una nueva pantalla de administración de sesiones remotas.
- Este trabajo completa la integración funcional del tablero; landing, empaquetado móvil y dockerización pertenecen a las issues separadas del proyecto.

## Verificación

`npm run test:kanban -w apps/backend` requiere `TEST_DATABASE_URL` apuntando a PostgreSQL exclusivo de pruebas. Cada suite crea un esquema temporal y lo elimina al terminar. Para ejecutar el conjunto completo: `node --test apps/backend/test/*.test.js` desde la raíz. Las pruebas reinician cuotas entre escenarios para aislarlas, sin alterar los límites de producción.

Validación automática: frontend completo, build, backend completo contra PostgreSQL local aislado, doble de LiveKit para flujo privado, doble HTTP para propuesta IA y migración de datos VIDEO anteriores. No se enviaron solicitudes a tu LiveKit/OpenAI ni se aplicaron migraciones en Neon durante esta preparación.

Antes de dar por aceptado el tablero, recorrer con dos usuarios reales: llamadas y permisos de micrófono/cámara, audio de ambos lados, bloqueo de reproducción del navegador, cierre de sesión y desconexión/reconexión. Probar con tus proveedores configurados y revisar escritorio/teléfono. El build conserva una advertencia de tamaño del bundle de LiveKit; la separación de carga queda como optimización posterior.
