# Álbumes de adjuntos

La vista previa mantiene imágenes, videos y PDF dentro del área disponible; las imágenes y los videos conservan su proporción completa. Las miniaturas tienen medidas estables, desplazamiento horizontal y controles de quitar accesibles, incluso en pantallas pequeñas y apaisadas.

## Envíos agrupados

Un envío confirmado de cuatro a seis recursos comparte un identificador persistido por el servidor. El historial de conversaciones privadas y canales presenta un mosaico de cuatro celdas. Cinco recursos muestran `+2` sobre la cuarta celda; seis muestran `+3`. Al abrir una celda se puede recorrer el contenido completo en la galería. El texto enviado acompaña al álbum.

No se agrupan envíos distintos por autor o cercanía de fecha. Si solo hay uno, dos o tres recursos disponibles (por paginación o eliminación), se presentan individualmente hasta contar con cuatro recursos del mismo envío. El límite existente de seis recursos por envío se conserva.

## Acciones

Los recursos no ofrecen editar y el servidor también rechaza su edición, tanto en privados como en canales. Eliminar mantiene las autorizaciones existentes: autoría, permisos de moderación y conexión. En un álbum, se abre el recurso y se elige **Eliminar recurso**, con la confirmación habitual. Se elimina ese recurso, no todo el envío. La galería mantiene sus controles de visualización y descarga.

## Migración

`20261122030000_albumes_adjuntos` agrega metadatos opcionales al mensaje y recupera los grupos anteriores cuando existe un recibo de envío confirmado con entre cuatro y seis recursos. Los mensajes anteriores sin ese recibo permanecen individuales: no hay evidencia suficiente para reconstruir su envío sin mezclar recursos ajenos. La migración no modifica los archivos ni sus permisos.

## Verificación

- Frontend: 388 pruebas en 41 archivos.
- Backend: 263 pruebas, incluidas migración desde las 19 migraciones anteriores, agrupación, aislamiento entre envíos y rechazo de edición.
- Prisma generado y compilación de producción completados.
- Navegador con datos sintéticos: privados y canales a 360, 768 y 1440 píxeles, más 850 × 390; selección múltiple, proporciones de vista previa, mosaico, navegación y eliminación con confirmación.

El recorrido de navegador usa respuestas de API y eventos de socket locales; la persistencia y las autorizaciones se verifican por separado en las pruebas backend con PostgreSQL aislado.
