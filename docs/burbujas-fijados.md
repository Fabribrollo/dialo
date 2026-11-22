# Burbujas unificadas y barra de fijados

La estructura de cada mensaje reúne autor (cuando corresponde), cita, texto o recurso, reacciones, estado de edición/fijado y hora en una sola burbuja. Se toma de Telegram la organización del contenido, manteniendo los colores claros y lavanda de Dialo. Los álbumes comparten el mismo contenedor y conservan las acciones por recurso. Los registros de llamadas mantienen su carácter inmutable.

El botón de ir al último mensaje ocupa una fila propia dentro del flujo del chat, antes del compositor. Su posición ya no depende de una distancia fija al borde inferior: la cita de respuesta, el selector de menciones o un compositor más alto no se superponen con él.

## Fijados

Los fijados aparecen en una barra compacta bajo la cabecera, inspirada en WhatsApp: icono, vista previa de una línea, posición dentro del conjunto, miniatura cuando es una imagen y acceso al listado completo. La barra desaparece cuando no hay fijados. Con varios, el control siguiente permite recorrerlos.

Pulsar la vista previa localiza y resalta el mensaje en el historial. Si falta, carga páginas anteriores de forma secuencial y cancelable, hasta encontrarlo. La búsqueda se limita a 40 páginas por acción; si no puede localizarlo, abre su contenido en el listado de fijados. No modifica el texto del borrador ni inicia envíos. En privados, también limpia el filtro de búsqueda antes de localizar.

El listado se consulta al abrir el chat conectado, al reconectar y al abrirlo explícitamente. Después se actualiza por los eventos existentes de mensaje actualizado/eliminado, sin consultar de nuevo por cada tecla o cada reacción. Los cambios que llegan durante una consulta se reconcilian antes de publicar el resultado. La consulta de fijados no agrega mensajes al historial ni altera los contadores de no leídos.

El servidor y sus permisos no cambian: gestión de canales para fijar en canales, amistad y participación en privados; edición prohibida para adjuntos. No se agregan migraciones ni dependencias.

## Validación

402 pruebas frontend en 42 archivos y build de producción. Se verifican la burbuja común, exclusividad del menú, permisos, actualización remota de fijados, respuesta con cita, localización de un mensaje antiguo y precedencia de la consulta de fijados sobre una página de historial anterior.

Recorrido de Chromium con datos sintéticos y API/socket simulados: privados y canales en 360, 768 y 1440 px, además de 850 × 390 horizontal. Se verificó la geometría del menú y la barra, reacción, fijar/desfijar, salto al mensaje fijado, envío de respuesta y que el botón del último mensaje quede por encima de la cita sin superposición. Pendiente validar con teclado virtual de teléfono físico. El backend no fue modificado por esta entrega; conserva la validación previa de 270 pruebas.
