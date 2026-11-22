# Experiencia de chat, formularios y carga de fuentes

Parche incremental sobre `t42-ajustes-rendimiento.patch`. Mantiene los materiales, colores y componentes actuales. No cambia package.json, lockfile ni .env y no requiere instalar dependencias.

## Cambios visibles

| Área | Comportamiento |
| --- | --- |
| Borradores | Texto separado por conversación/canal, conservado al navegar dentro de la sesión. Hasta 50 por categoría, conservando los editados más recientemente. Se limpia al cerrar sesión o recargar; no usa localStorage. Una pérdida de acceso al canal descarta su borrador. |
| Envío de texto | Estado Enviando y bloqueo de dobles clics. Reintentar el mismo texto tras perder la confirmación conserva el identificador. Un envío confirmado posterior recibe un identificador nuevo, aunque el texto coincida. |
| Subidas | Progreso real de transferencia, estado Confirmando al llegar al servidor y Cancelar envío. El borrador permite reintentar con la misma clave. Cambiar de destino/cerrar la vista cancela la transferencia local. |
| Lectura | Ir al último mensaje al desplazarse hacia arriba. Los mensajes ajenos que llegan mientras se lee arriba generan un separador y contador sin forzar scroll. La paginación y los mensajes propios no cuentan como nuevos. No se marca leído mientras se lee arriba, carga el historial o se busca. |
| Galería | Recorre los recursos del historial cargado con anterior/siguiente y flechas. Ampliar/ajustar imágenes, pantalla completa cuando el navegador la permite y descarga desde el visor. El recurso se retira del visor si desaparece del historial autorizado. |
| Formularios | Aviso común al salir con cambios en perfil, comunidad, canal, permisos, roles y moderación. La creación de canal también protege texto ingresado. Permite quedarse o descartar. Guardar con éxito desactiva el aviso. |
| Teclado | Pestañas con flechas, Home y End; una sola parada de Tab, foco visible y desplazamiento del tab enfocado. |
| Integrantes | Permisos efectivos calculados por servidor y roles que aportan capacidades aplicables al canal. Actualización al cambiar integrantes/roles/permisos, sin conservar una ficha obsoleta. |

La protección de formularios usa el router de datos de React Router, para incluir enlaces y Atrás/Adelante de navegación interna. Al recargar, cerrar la pestaña o salir del documento se utiliza la confirmación propia del navegador. Los avisos no convierten los borradores de chat en formularios pendientes: cambiar de chat conserva ese texto sin interrumpir la navegación.

La galería recorre solo archivos ya cargados y autorizados; no descarga todo el historial ni agrega un panel de compartidos. Los recursos de una tanda conservan sus mensajes individuales y controles existentes.

Cancelar la transferencia no puede revertir un commit que ya terminó. En ese caso se debe mirar el historial; reintentar el mismo contenido utiliza el mismo recibo para recuperar los IDs originales. Cambiar el contenido crea otro envío.

## Confirmación de envíos

Migración `20261122020000_envios_confirmados`: tabla por autor/UUID con huella SHA-256 de la solicitud, IDs de mensajes y fecha. No duplica contenido, archivos ni credenciales. Los recibos se conservan en la base y se eliminan al borrar la cuenta.

El identificador `idEnvio` es opcional para clientes anteriores. Texto privado, texto de canal y tandas de archivos lo admiten. La clave se valida como UUID; su reutilización con otro destino/contenido devuelve `SEND_KEY_CONFLICT`. El lock transaccional serializa intentos concurrentes y el recibo se confirma junto con los mensajes. Un replay no vuelve a publicar el evento ni la notificación. Devuelve la versión vigente: si el mensaje fue editado o eliminado, no recupera contenido antiguo.

Cada reintento revalida autorización/amistad/permisos. Si las filas anteriores ya no existen físicamente responde `SEND_UNAVAILABLE`. La carga nueva conserva la validación de bytes, tamaños y moderación del texto de canales. La comprobación de amistad y participación usa la conexión de la transacción para funcionar también con pools de una conexión, sin consultas anidadas al pool global.

## Fuentes y rendimiento

Geist y Schibsted Grotesk se sirven como WOFF2 locales con font-display swap; sus subconjuntos latinos se precargan. Archivo, con ancho/peso variables y cursiva, se carga solo en la landing. Se elimina la hoja externa de Google Fonts y sus preconnect. Se incluyen fuentes sin modificar, licencias OFL y procedencia/versiones en public/fonts/SOURCES.md. Las mismas familias siguen siendo las de la estética de Dialo.

La galería memoriza su lista/contexto para no redibujar las tarjetas por cada tecla del compositor. Se mantiene la carga diferida de LiveKit y rutas. El router de datos requerido para proteger navegación añade JS: la medición actual debe compararse con la entrega previa, sin reutilizar su porcentaje como si fuera el resultado de esta entrega.

## Validación y límites

382 pruebas frontend en 40 archivos y 260 backend sobre PostgreSQL local con schemas aislados. Incluyen reintentos concurrentes, conflicto de claves, permisos revocados, mensajes eliminados, tandas atómicas, borradores separados/límite, contador de lectura, pestañas, bloqueo de navegación, galería, XHR/progreso/cancelación y recuperación de errores del directorio.

Chromium con build de producción y fixtures: 360/768/1440 px y 850×390 horizontal. Se comprobó conservar borradores al navegar, volver al último mensaje con scroll real, navegar/ampliar galería, cancelar/reintentar una subida con la misma clave, protección al salir del perfil y con Atrás, permisos efectivos y carga de fuentes locales. Sin errores de página ni desbordes de controles en las comprobaciones de integrantes. No se usan capturas con datos reales como entregables.

Pendiente en el entorno del usuario: teléfono físico/teclado virtual, pantalla completa según iOS/Android, LiveKit entre dos cuentas y tiempos reales de Neon/red móvil. No se promete una reducción de segundos sin medir ese entorno. Los binarios de adjuntos continúan en PostgreSQL; no se cambió su almacenamiento ni se agregó infraestructura de telemetría o Web Push.

## Aplicación

Detener dev, comprobar/aplicar parche, generar Prisma, ejecutar migrate deploy y consultar migrate status antes de iniciar la API. Esta base pasa a 19 migraciones. Ver LEEME.md del ZIP para los comandos PowerShell y recorrido manual. No se hizo commit ni push.

### Tamaño de la entrada actual

Con la misma suma de entrada + modulepreload y gzip consistente usada en el informe previo:

| JS inicial | Entrega anterior | Esta entrega |
| --- | ---: | ---: |
| Minificado | 506,57 KB | 572,52 KB |
| Gzip | 155,87 KB | 176,78 KB |

El incremento corresponde principalmente al router de datos necesario para bloquear correctamente la navegación; no se presenta como una reducción de bundle. Se mantiene por debajo de la base anterior a optimización (1.103,76 KB / 304,90 KB gzip). Las dos fuentes latinas precargadas de UI suman 76,15 KB WOFF2, aparte de JS; sustituyen las solicitudes externas de esas familias y eliminan la hoja de estilos externa del camino de carga. La medición no representa tiempos de red reales.
