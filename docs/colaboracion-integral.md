# Colaboración, perfiles y apariencia

> Esta entrega queda ajustada por [Refinamiento de experiencia](refinamiento-experiencia.md): cambian los bloqueos, el audio y la búsqueda; se pausan hilos, mano levantada y modo oscuro.

La migración `20261122050000_colaboracion_integral` agrega encuestas, votos, hilos, confirmaciones de entrega/lectura, distinción de avisos, silencios, personalización de perfiles, bloqueos, reportes y registro administrativo. Es la migración 22 de esta entrega; no requiere recrear datos ni ejecutar seed.

## Experiencia

- El acceso al final del historial usa una flecha. El menú del mensaje aparece al pasar el cursor o enfocar; en dispositivos táctiles permanece disponible.
- La barra de fijados localiza el mensaje mostrado y avanza al siguiente con cada clic. Se desfija desde el propio mensaje, sin una ventana intermedia.
- El regreso desde archivados dice «Volver» y no muestra contador.
- La búsqueda consulta todo el historial permitido, con texto, autor por nombre de usuario, contenido y fechas inclusivas en UTC. Los filtros ocupan una fila independiente. Las respuestas de hilos abren el hilo desde el resultado.
- Las menciones y las respuestas distinguen sus avisos dentro del centro de actividad existente. `@everyone` requiere GESTIONAR_CANALES y solo alcanza a integrantes con acceso al canal; respeta silencios y preferencias. Se valida también en textos adjuntos a archivos.
- Las encuestas admiten 2–10 opciones, voto simple o múltiple, retirar/cambiar voto y cierre por autor o gestión del canal. Las opciones y la pregunta no se editan después de publicarlas. El voto se serializa en una transacción.
- Los hilos de canales de texto conservan sus respuestas fuera del historial principal. Mantienen permisos del canal, paginación, edición y borrado según autorización.
- Los mensajes privados muestran enviado, entregado y leído. Entregado corresponde a recepción por una sesión activa de la aplicación; leído, a un chat visible/enfocado. Los estados persistidos se conservan ante respuestas HTTP atrasadas y se muestran también en álbumes.
- Cada conversación/comunidad puede silenciarse una hora, un día o permanentemente desde su menú, y reactivarse. El silencio de comunidad cubre sus canales.
- El nombre o avatar del usuario abre su perfil público. En escritorio ancho ocupa la columna derecha; en pantallas menores aparece en una ventana. Se personalizan presentación, pronombres y color de portada, además de los campos existentes. Correo y preferencias no se publican.
- Bloquear impide mensajes y llamadas privadas en ambas direcciones, cierra llamadas privadas activas y conserva la amistad y el historial. Desbloquear restablece el uso de esa amistad. No oculta mensajes en comunidades compartidas.
- Los reportes de comunidad se revisan en Moderación por propietario/administradores. Los generales quedan registrados: aún no existe una consola de revisión global ni un rol global que pueda resolverlos.
- El registro administrativo muestra actor, acción y fecha. Registra mutaciones HTTP exitosas de comunidades/canales/roles, excluye mensajes y llamadas y no conserva cuerpos ni secretos. Su escritura posterior a la respuesta es de mejor esfuerzo; no es una bitácora transaccional de todas las acciones del sistema.
- Los audios permiten solicitar micrófono, grabar hasta 5 minutos/5 MB, detener, escuchar, descartar y confirmar envío. El cambio de chat cancela recursos pendientes. Requiere HTTPS o localhost y permiso del navegador. Formatos de audio disponibles: WebM, Ogg y M4A/MP4, según navegador. También se adjuntan desde el selector. El audio no se envía al seleccionarlo.
- En Perfil, después de Notificaciones, Apariencia guarda el modo oscuro por cuenta. Abarca navegación, chats, formularios, diálogos y nuevos paneles.
- Las llamadas incorporan mano levantada y pantalla completa de cámara/pantalla compartida; conservan el indicador de hablante activo. La mano se sincroniza con atributos de LiveKit y el token autoriza actualizar únicamente atributos propios.

No se incorporan mensajes guardados ni instalación PWA.

## API adicional

Todas las rutas requieren sesión. Los identificadores se validan y el servidor verifica acceso por operación.

| Ruta bajo `/api/features` | Operación |
| --- | --- |
| `GET /people/:id` | Bloqueo propio y comunidades compartidas |
| `PUT /people/:id/block` | Bloquear/desbloquear |
| `POST /people/:id/reports` | Registrar reporte |
| `GET /communities/:id/reports` | Revisar reportes de comunidad |
| `PATCH /reports/:id` | Resolver/desestimar con autorización |
| `GET /communities/:id/audit` | Registro paginado de administración |
| `POST /polls/:id/vote` | Sustituir el voto propio |
| `POST /polls/:id/close` | Cerrar encuesta |
| `GET /threads/:id` | Respuestas paginadas del hilo |
| `POST /receipts/:id` | Confirmación propia de recepción/lectura |

Los envíos existentes aceptan `encuesta`; los de canal, `idHilo`. La búsqueda existente acepta `autor`, `tipo`, `desde` y `hasta`. `/users/me/preferences` fusiona `tema` y preferencias de avisos para no sobrescribirlas entre sí. Los eventos existentes de actualización de mensajes transportan encuestas/votos; `message:receipts` informa confirmaciones privadas.

## Validación

- 280 pruebas backend con PostgreSQL aislado, incluyendo migraciones históricas, permisos, idempotencia, archivos, sockets y 35 recorridos de armonía.
- 415 pruebas frontend. Casos nuevos de filtros, persistencia del tema, voto/retiro/cierre, audio recibido y ciclo de grabación/cancelación/envío.
- Build de producción correcto. Permanece el aviso de tamaño del chunk diferido de LiveKit; no se añadieron dependencias.
- 16 recorridos de navegador en chats privados/canales a 360, 850, 1320 y 1440 píxeles, con ambos temas: búsqueda, menú de mensajes, apertura de perfil y ausencia de desborde horizontal. Datos y servicios de estas comprobaciones visuales son simulados.
- No se validó una llamada real entre dos dispositivos contra un servidor LiveKit externo ni una grabación física de micrófono. El flujo de grabación se cubre con simulación y los permisos/persistencia de audio con servidor y base reales.
