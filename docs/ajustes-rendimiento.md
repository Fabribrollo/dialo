# Ajustes de interfaz y revisión de rendimiento

Entrega incremental sobre `t42-pulido.patch`, conservando los materiales de Dialo. No agrega dependencias ni cambia el package.json raíz.

## Interfaz y adjuntos

El enlace de la conversación tenía z-index 1 y cubría el disparador de los tres puntos. El botón queda ahora por encima de ese enlace. Se mantienen un solo menú abierto, Escape/clic exterior y posición dentro del viewport. Chats archivados se ubica al pie del listado, con cantidad, solo cuando hay destinos archivados. Los mensajes pendientes ocupan el lugar del avatar; la llamada activa aparece en una esquina de ese mismo espacio.

El selector de adjuntos usa iconos y superficies del sistema actual. Permite elegir hasta seis archivos, revisar cada uno, quitar/agregar recursos y acompañarlos con un texto de hasta 2000 caracteres. Los límites por archivo se mantienen: imágenes/PDF 5 MiB y videos 2 MiB; el conjunto admite hasta 20 MiB. El texto acompaña al primer recurso, los demás mantienen mensajes propios para conservar compatibilidad con historial y visores. No incluye edición de imagen ni otras herramientas de WhatsApp.

La vista previa se monta fuera del formulario principal, con su envío independiente. Cancelar libera los object URLs. Un cambio de conversación descarta el borrador; una respuesta tardía no modifica el nuevo destino. La publicación usa una transacción para evitar envíos parciales por validación o permisos. Como otros envíos del proyecto, una respuesta perdida tras confirmar el commit puede requerir comprobar el historial antes de reintentar.

Los registros de llamada tienen `registroLlamada` asignado exclusivamente por servidor. No ofrecen editar/eliminar y el backend rechaza esas operaciones. Escribir una frase parecida en un mensaje normal no lo vuelve inmutable. La migración recupera los registros históricos que coinciden con conversación, emisor, texto terminal y fecha de una llamada persistida. No puede reconstruir un registro histórico cuyo contenido ya fue editado o cuya llamada ya fue eliminada.

Integrantes de canales públicos tiene cabecera, explicación, selector con carga/error, ficha de la persona elegida y acciones separadas. Las pestañas usan una única superficie seleccionada, sin una lente animada que muestre temporalmente dos selecciones. Se revisaron anchos mínimos, saltos de línea y controles en pantallas pequeñas.

## Revisión de cargas

Se inspeccionaron entrada y rutas, proveedores de estado/sockets, consultas del lateral, historial, adjuntos, llamadas y consultas de permisos/actividad del backend. Se midieron bundles y solicitudes con fixtures; no se dispone de latencias reales de Neon/LiveKit ni de un dispositivo móvil físico.

| Área | Hallazgo | Cambio o criterio |
| --- | --- | --- |
| Arranque | El SDK LiveKit se incluía al cargar la aplicación | Importación dinámica al intentar conectar; cancelar mientras carga no reserva una llamada |
| Pantallas | Perfil, autenticación y administración se cargaban al iniciar | Separación por ruta; Suspense dentro del shell mantiene navegación y llamadas montadas |
| Lateral | Cambiar referencias de la lista podía repetir el efecto de actividad | Dependencia estable por IDs de comunidades |
| Actividad | Cada evento podía consultar todas las comunidades | Agrupar ráfagas de 100 ms y consultar el destino afectado; eventos sin ID revalidan todos |
| Pool | Promise.all sin límite para comunidades | Hasta cuatro solicitudes de actividad simultáneas y una tanda activa, sin consultas solapadas |
| Seguridad | Respuestas anteriores podían llegar después de una revocación | Invalidación por comunidad y descarte de respuestas anteriores; no se guarda caché privada persistente |
| Segundo plano | El contador de chats consultaba cada 30 s aun oculto | El sondeo periódico se pausa al ocultarse la pestaña; eventos y recuperación siguen activos |
| Adjuntos | Después de publicar se vaciaba/reconsultaba historial y permisos | Integrar la respuesta autorizada y deduplicar con socket, conservando eliminaciones y scroll |
| Pestañas | Se medía la lente con layout/ResizeObserver | Selección visual por CSS, sin mediciones ni dos superficies activas |
| Historial y medios | Paginación, imágenes lazy y videos metadata ya estaban presentes | Se conservan; no se descarga todo el historial al entrar |
| PostgreSQL | Autorizaciones y cambios comparten bloqueos transaccionales | Se conservan para evitar regresiones de permisos; no se cambia aislamiento para obtener una cifra artificial |

## Medición reproducible

Misma herramienta Vite, mismas dependencias y dos checkouts: base pulido y esta entrega. Se suman el script de entrada y todos los modulepreload JS de index.html. Gzip calculado con la misma configuración en ambos casos; KB decimales, sin CSS, fuentes, API ni módulos de rutas posteriores.

| JS inicial | Antes | Después | Reducción |
| --- | ---: | ---: | ---: |
| Minificado, entrada + preloads | 1.103,76 KB | 506,57 KB | 54,1 % |
| Gzip consistente | 304,90 KB | 155,87 KB | 48,9 % |

El archivo principal solo pasa a 394,75 KB, pero la comparación anterior incluye sus dependencias para no ocultar su costo. El SDK de llamadas queda en un chunk de 571,12 KB que se pide al conectar; el aviso Vite >500 KB corresponde a ese recurso diferido. No se oculta el aviso elevando un límite.

En Chromium sobre el build de producción se comprobó que LiveKit no se solicita al iniciar. La prueba de actividad con dos comunidades y tres eventos del mismo destino hace dos pedidos iniciales y uno adicional, en vez de repetir el listado completo. Reducir bytes/consultas no equivale a afirmar un tiempo de carga en segundos: depende de red, servidor, base y dispositivo.

## Verificación y siguientes mediciones

370 pruebas frontend en 38 archivos; 256 backend en PostgreSQL local con schemas aislados; Vite y git diff --check. Incluye transacción múltiple, archivos inválidos, permisos, moderación de texto con proveedor simulado, inmutabilidad y migración histórica, integración de respuestas sin recargar, deduplicación, respuestas revocadas y funcionamiento de llamadas con SDK simulado.

Chromium con datos simulados: clic real en los tres puntos, menú único, badge de no leídos, selección nativa de dos imágenes, texto/vista previa/envío, perfil, roles e integrantes. Sin errores de página ni desbordamientos horizontales detectados a 360/768/1440 px y 850×390 horizontal. Las capturas se usaron solo como comprobación interna.

Pendiente para medir en el despliegue real: p50/p95 de API y Neon con cuentas de distintas cantidades de comunidades, rendimiento en teléfono y red móvil, inicio de llamada con descarga fría de SDK y reproducción de videos reales. Las fuentes externas pueden demorar el primer pintado y los adjuntos binarios siguen en PostgreSQL; son siguientes candidatos para evaluar con esas mediciones, sin introducir caché compartida de contenido privado.

## Aplicación

Detener procesos de desarrollo, comprobar/aplicar parche, generar Prisma, desplegar migración `20261122010000_registro_llamada` y verificar migrate status antes de iniciar la nueva API. Las pruebas backend deben usar TEST_DATABASE_URL exclusiva de pruebas. No se hizo commit ni push.
