# Menú de mensajes y conversación contextual

El botón de tres puntos reemplaza los controles de editar y eliminar que estaban expuestos en el historial. Solo permanece abierto un menú de mensaje a la vez. Se posiciona dentro de la ventana, cierra al tocar afuera o con Escape y permite recorrer sus opciones con flechas, Inicio y Fin. Mantiene la estética clara de Dialo.

## Acciones

| Acción | Comportamiento |
| --- | --- |
| Responder | Selecciona un mensaje, muestra autor y texto sobre el compositor y envía su referencia. También funciona al enviar adjuntos. Se puede cancelar antes de enviar. |
| Reaccionar | Ofrece 👍 ❤️ 😂 😮 😢 🙏. Cada usuario mantiene una reacción por mensaje; elegir otra la reemplaza y volver a pulsar la propia la retira. |
| Copiar texto | Copia el texto o epígrafe al portapapeles del navegador. Si el navegador lo impide, informa el error. |
| Fijar / Desfijar | Persiste el estado y lo sincroniza. El acceso a Mensajes fijados recupera hasta 50 mensajes del destino sin depender del historial ya cargado. El máximo es 50 fijados simultáneos por chat/canal. |
| Editar | Conserva las reglas existentes del autor y escritura; no se ofrece para adjuntos. |
| Eliminar | Conserva la confirmación y las reglas existentes de autoría y moderación. En álbumes actúa sobre el recurso de la celda elegida, nunca sobre todo el envío. |

No se ofrecen acciones sobre mensajes eliminados ni registros de llamadas. La galería mantiene sus controles de descarga y visualización. Los álbumes siguen agrupándose por envío y muestran un menú por celda visible; para los recursos restantes se conserva la eliminación desde el visor.

## Autorización y persistencia

En privados, responder, reaccionar y fijar requieren participar y conservar la amistad. La consulta de fijados solo exige ser participante, como el historial. En canales se exige acceso; responder/reaccionar requieren ESCRIBIR y fijar requiere GESTIONAR_CANALES, disponible para propietario y administradores y para roles autorizados. El cliente muestra acciones disponibles y el servidor vuelve a verificar sesión y permisos. Las reacciones y los fijados no generan mensajes nuevos ni suman avisos de mensajes sin leer.

La migración `20261122040000_interacciones_mensajes` agrega la referencia opcional de respuesta, fecha de fijado y tabla de reacciones con clave única mensaje/usuario. No requiere seed ni cambios de dependencias. Las respuestas solo pueden citar mensajes disponibles del mismo destino. La cita usa el contenido vigente y oculta el texto eliminado; un reintento de envío confirmado sigue recuperándose aunque luego se elimine el mensaje citado.

Los menús no vuelven a dibujar todo el historial al escribir: el contexto conserva identidad mientras no cambien sus datos y las referencias se resuelven por mapa de IDs. La selección de una respuesta es temporal y se limpia al cambiar de chat. Los borradores de texto conservan el comportamiento previo.

## Contrato de socket

- `message:interact` para privados y `channel-message:interact` para canales.
- `{ accion: 'reaccionar', idMensaje, emoji }`: emoji permitido o null para retirar la reacción propia.
- `{ accion: 'fijar', idMensaje, fijado }`: estado booleano.
- `{ accion: 'fijados', idDestino }`: devuelve `{ items }`, ordenados por fecha de fijado e ID, de más reciente a más antiguo.
- Las mutaciones devuelven `{ mensaje }` y publican el evento existente `message:updated` o `channel-message:updated`.
- Los mensajes incluyen `reacciones: [{ emoji, usuarios }]` y `fechaFijado` (null cuando no está fijado). Las respuestas incluyen `respuesta: { id, idAutor, autor, contenido, eliminado, tipoAdjunto? }`.
- Los envíos de texto admiten `idRespuesta` opcional. `/files` y `/files/batch` lo admiten como campo multipart; solo el primer recurso del envío porta la referencia.

## Verificación

396 pruebas frontend en 42 archivos, 270 backend en PostgreSQL aislado, Prisma generado y build de producción completados. Se comprueban autorizaciones, exclusión de llamadas, respuestas entre destinos, edición/eliminación de originales, recibos de adjuntos, límite de fijados, reacciones concurrentes y entrega de eventos entre sockets.

Chromium con build de producción y fixtures locales: privados y canales a 360, 768, 1440 px y 850 × 390 horizontal. Se verificaron menú dentro de la ventana, agregar/retirar reacción, fijar/desfijar y enviar respuesta con cita. Sin errores de página. Las respuestas API/socket del recorrido visual son simuladas; la persistencia y el socket autenticado se verifican por separado en el backend. Pendiente probar en un teléfono físico y dos cuentas reales sobre el entorno del usuario.

## Corrección del esquema en SQL manual

El bloqueo de mensajes ahora califica la tabla con el esquema de `DATABASE_URL` (o `public` cuando no se indica uno), escapando el identificador. La consulta manual anterior dependía del `search_path` de la conexión: bajo un esquema aislado o una conexión con otro `search_path` podía fallar con `42P01 relation "mensaje" does not exist`, aunque las tablas existieran y las migraciones estuvieran aplicadas.

La prueba de regresión fuerza `search_path = pg_catalog` dentro de la transacción y verifica reacciones, fijado, listado, retiro de reacción y desfijado tanto en privado como en canal. Se reprodujo el fallo antes del arreglo. El cambio no requiere migraciones ni regenerar Prisma. Las pruebas anteriores locales no habían forzado ese estado de la conexión.
