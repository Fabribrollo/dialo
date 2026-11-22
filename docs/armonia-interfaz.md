# Armonía de interfaz y chat

Actualización incremental sobre T-42 con roles granulares y corrección Node 26 aplicados. Mantiene los materiales de vidrio, el acento violeta, las tipografías y los componentes de Dialo.

## Llamadas y recursos

Las llamadas privadas y de canal fuera de su vista usan CallBar, con hasta tres avatares sin desplegable, estado/tiempo, controles disponibles, regreso y cierre. Abrir Ajustes cuenta como salir de la escena aunque la URL no cambie. En móvil sigue visible también al abrir la lista lateral. La escena privada vive dentro del chat, nunca después del shell. Los dispositivos solo se capturan al aceptar/iniciar; Activar audio permite recuperar reproducción bloqueada por el navegador.

El adjunto está integrado en el compositor: PNG/JPEG/WebP/PDF hasta 5 MiB y MP4/WebM hasta 2 MiB. Se comprueban bytes y tamaño en el servidor, además del control de cliente. El botón + abre un menú Fotos y videos / Documento (PDF). La selección abre una vista previa y solo Enviar adjunto inicia la carga; cancelar descarta el borrador. En el historial no se muestra el nombre del archivo, pero sigue disponible en el visor. La miniatura usa contain, sin recortar la imagen/video; al pulsar se abre un visor con recurso completo, controles de video, cierre con retorno de foco y descarga explícita. Se retiró la interfaz del historial de compartidos. La ruta histórica sigue autenticada para compatibilidad.

GET `/api/files/:id` revalida sesión y acceso, usa inline y no-store; `?download=1` descarga. Soporta rangos de bytes autenticados para reproducción. El recurso no se sirve después de eliminar el mensaje o perder acceso. Compartir un enlace al archivo no concede autorización.

## Avisos y ajustes

ToastHost/Toast es la única salida transitoria: abajo al centro, material común, máximo tres visibles, cierre y acciones. El temporizador se pausa con hover/foco; llamadas entrantes y avisos que requieren una acción permanecen. Notice publica en ese mismo destino, sin reservar espacio en la página. Los campos inválidos y estados de carga conservan su contexto junto al control: no son ventanas emergentes. Las confirmaciones destructivas siguen usando el diálogo común con foco y cancelación.

La sección Notificaciones contiene solo Avisos del navegador o sistema y Desactivar notificaciones. Se retiró la sección Dispositivos del perfil; esta pantalla no solicita acceso a cámara ni micrófono. La autorización del sistema se pide mediante un gesto explícito; el service worker muestra avisos compatibles en móvil y dirige a una ruta propia. En algunos móviles requiere instalar la aplicación. No incluye infraestructura Web Push para recibir con Dialo completamente cerrado; los eventos se reciben mientras la aplicación sigue conectada.

## Conversaciones

GET `/api/chat-state` devuelve destinos propios con `archivado`, `oculto`, `noLeidos`. PATCH `/api/chat-state/:tipo/:destino` recibe `{archivado:boolean}`, `{oculto:boolean}` o `{leido:true}`; tipos conversacion/comunidad/canal. No admite ocultar comunidades: corresponde salir. Archivar canales individuales tampoco está habilitado; se archiva la comunidad.

Archivar conserva historial y membresía y silencia avisos/tonos de ese destino para esa cuenta. Archivados aparece solo cuando hay destinos archivados y permite recuperarlos; los contadores siguen indicando mensajes pendientes. Eliminar un privado lo retira solo de la lista propia: conserva amistad y mensajes de ambos. Abrirlo desde Amigos o recibir actividad nueva lo vuelve a mostrar. Quitar una comunidad requiere confirmar la salida; su propietario debe transferir antes. Ninguna acción lateral borra la comunidad globalmente.

Los contadores excluyen mensajes propios, eliminados y canales inaccesibles. Cada canal guarda su lectura por separado para no marcar como leídos otros canales de la comunidad. La lectura se sincroniza por cuenta entre pestañas, se conserva al recargar y se marca solo con la vista activa. El lateral indica llamadas activas y conserva una única entrada Amigos, sin el botón + duplicado.

## Canales y comunidad

Una entrada Ajustes reúne General, Permisos públicos, Integrantes y Solicitudes privadas administrativas. Los formularios se recargan ante cambios remotos antes de sobrescribir. Las capacidades base/especiales y su herencia están en [roles-permisos.md](roles-permisos.md).

El resumen de comunidad muestra cantidad y tipos de canales, con Ver canales, de forma equivalente al resumen de integrantes. Las insignias personalizadas y acciones de integrantes se adaptan a filas y tamaños pequeños.

## Migración y comprobaciones

La nueva migración `20261121190000_armonia_chat` añade vencimientos de baneo, expulsiones de canal y estado de chat. Inicializa los marcadores de lectura para no contar todo el historial previo como nuevo. Generar Prisma y ejecutar migrate deploy en la base configurada por cada entorno.

Pruebas automatizadas: suites frontend, compilación Vite y conjunto backend sobre PostgreSQL local con esquemas temporales. Revisión en Chromium con datos simulados a 360, 390, 768, 1024 y 1440 px, además de horizontal 850×390. Incluye navegación, menús, formularios, escenas de llamada y selector/confirmación de adjuntos. Los proveedores LiveKit/IA/correo se simulan; falta confirmar audio/video con dos cuentas y el proveedor real.

Recorrido manual pendiente en PC/móvil: llamada privada y de canal con otra persona, navegación a Inicio/Ajustes, orientación vertical/horizontal y tres avatares; imagen vertical/horizontal y MP4/WebM reales, visor/descarga; avisos encima de confirmaciones sin tapar controles; roles heredados, silencio en llamada y restitución; archivar/desarchivar y mensajes nuevos en dos pestañas; ban temporal y reingreso. Comprobar también en un teléfono real el teclado virtual y los permisos del sistema.

El refinamiento posterior se documenta en [pulido-interfaz.md](pulido-interfaz.md); no incorpora migraciones adicionales.
