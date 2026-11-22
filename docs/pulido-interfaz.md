# Pulido de interfaz posterior a armonía

Parche incremental sobre `t42-armonia.patch` aplicado. Conserva la estética actual. No añade dependencias, migraciones ni cambios a variables de entorno.

## Comportamiento

- El lateral mantiene un solo menú de conversación abierto. Se ubica dentro de la pantalla, fuera del contenedor con scroll, y cierra con Escape, clic exterior o navegación. Archivados solo aparece si contiene destinos.
- Los círculos de canales del resumen miden 40 px y tienen separación, como los integrantes.
- Perfil muestra únicamente las dos preferencias de notificaciones; se retira Dispositivos y se ajusta el ancho.
- Las pestañas conservan palabras completas y permiten desplazamiento horizontal. Formularios y acciones se redistribuyen; los paneles mantienen scroll vertical en móvil y horizontal de poca altura.
- La lista de integrantes de la comunidad deja de aparecer dentro del chat. Se administra desde Ajustes.
- El último paso de creación privada explica dentro del diálogo que administración tiene acceso inicial y luego admite personas o resuelve solicitudes. No usa un popup para esa explicación.
- Las escenas de llamada usan tarjetas proporcionadas y controles en flujo. Compartir pantalla en una llamada privada se muestra como fuente propia, separada de las cámaras.
- El compositor abre Fotos y videos o Documento (PDF), luego vista previa con cancelar/enviar. Seleccionar un archivo no lo sube. Videos hasta 2 MiB; imágenes/PDF hasta 5 MiB. No se muestra el nombre en las tarjetas enviadas; el visor conserva controles y descarga.
- El anfitrión común de avisos deja de heredar una clase antigua que estiraba la superficie por la pantalla. En móvil no se duplica la campana cuando está abierto el centro de actividad.

## Presencia y pantalla compartida

El servidor recupera autorizaciones pendientes de llamada solo si LiveKit confirma la misma identidad e identificador de ingreso; vuelve a validar acceso y sesión. Un token emitido sin conexión no crea presencia. El cliente refresca la lista periódicamente mientras la pestaña está visible y al recuperar foco/conexión. Una respuesta HTTP antigua no borra un evento de ingreso más reciente.

El token privado habilita micrófono, cámara, pantalla y audio de pantalla dentro de la sala autorizada, sin administración. Antes faltaban las fuentes de pantalla. La interfaz actualiza las pistas locales y remotas al publicarlas/retirarlas. Es necesario iniciar una llamada nueva para recibir el token corregido.

## Verificación

Las suites frontend cubren menús únicos, vista previa y confirmación, cancelación, reintentos, cambios de destino, video, ausencia de nombres en tarjetas, contenido del paso privado, eventos de pantalla y refresco de participantes. Backend verifica recuperación con proveedor simulado, rechazo de identificadores ajenos y fuentes del token privado. La suite backend completa usa PostgreSQL local con esquemas aislados.

Chromium: revisión de escritorio/tablet/móvil con fixtures de datos, sin conectarse a cuentas reales. Anchos 360, 390, 768, 1024 y 1440 px; horizontal 850×390. Se inspeccionaron perfil, ajustes de canal, resumen, chat, notificaciones, llamadas, roles, integrantes, invitaciones, moderación, creación de comunidad y autenticación. Se ejercitó el selector nativo de archivo y el envío confirmado.

Pendiente en el entorno del usuario: llamada entre dos cuentas con LiveKit real (presencia, cámara y pantalla), teclado virtual/gestos en teléfono real, archivo PDF/video reales y avisos del sistema. La revisión con fixtures no acredita conectividad audiovisual ni permisos físicos del dispositivo.
