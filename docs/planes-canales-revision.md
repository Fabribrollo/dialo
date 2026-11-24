# T-46 a T-49: planes de canales y revisión de contenido

Base de integración: `77a234c` (incluye F-14/T-50–T-52 y Docker). Esta entrega agrega una migración y no cambia dependencias, lockfiles ni archivos de entorno reales.

## T-46 y T-47: organizar canales con IA

En **Comunidad → Canales**, el propietario encuentra **Organizar con IA**. Escribe el pedido y recibe una lista con el estado anterior y el orden final. La vista distingue canales nuevos, cambios de nombre, permisos, posiciones y eliminaciones. El tipo y privacidad de canales existentes se conservan; su configuración manual y sus reglas de acceso siguen vigentes.

- Solo el propietario puede preparar y confirmar. La autorización se consulta antes de enviar el pedido al proveedor y se repite al guardar y confirmar.
- Al proveedor se envían únicamente las instrucciones y el catálogo mínimo de canales de esa comunidad (identificador, nombre, tipo, privacidad, posición y permisos globales). No recibe historial, integrantes ni mensajes.
- La respuesta se valida contra un esquema y contra los IDs y tipos existentes. No acepta canales ajenos, IDs duplicados ni permisos administrativos inexistentes. Los privados no reciben permisos globales editables.
- Si hay nombres repetidos referidos en el pedido, se pide aclarar con `#id`. La IA también puede devolver una aclaración sin preparar acciones. No se debe confirmar por conjetura: el usuario revisa el antes y después.
- Preparar solo guarda la propuesta, no modifica canales, mensajes ni llamadas. Vence a los 15 minutos, está vinculada a la cuenta y comunidad y su contenido ejecutable permanece en el servidor.
- La huella abarca catálogo, posiciones y configuraciones de acceso, roles y membresías. Una modificación posterior rechaza la confirmación con `PLAN_STALE` y obliga a generar una nueva propuesta.
- Para eliminar, la interfaz exige reconocer que se perderán los canales y sus historiales. El plan puede dejar la comunidad sin canales, como el CRUD manual.
- Confirmar ejecuta los cambios en una transacción bajo el mismo bloqueo comunitario que el CRUD. Un fallo revierte también borrados, propuesta y auditoría. Repetir una confirmación devuelve su resultado sin volver a ejecutarla.
- Se reutilizan las escrituras del CRUD, la publicación de cambios de acceso, retiros de salas/socket, revocación de llamadas y notificaciones de permisos. No se amplía el acceso mediante una propuesta.
- El registro administrativo conserva actor, fecha, antes y después. **Ver cambios de canales** permite consultar el detalle. Cancelar impide ejecutar esa propuesta; navegar fuera sin confirmar tampoco aplica nada y la propuesta vence.
- Límites: 5 generaciones/minuto/cuenta, hasta 100 canales en el plan y 20 nuevos por propuesta. Se reutilizan `OPENAI_API_KEY` y `OPENAI_GENERATION_MODEL` del backend.

### API de planes

| Método | Ruta | Cuerpo |
|---|---|---|
| POST | `/api/communities/:id/channel-plans` | `{ instrucciones }` |
| POST | `/api/communities/:id/channel-plans/:propuesta/confirm` | `{}` |
| POST | `/api/communities/:id/channel-plans/:propuesta/cancel` | `{}` |

Preparar devuelve `{ propuesta: { id, antes, despues, vence }, aclaracion: '' }` o `{ propuesta: null, aclaracion }`. Confirmar no acepta un plan modificado por el cliente. Errores principales: 401/403/404 por autorización, 409 por estado o huella, 429 por cuota y 503 por proveedor o salida inválida.

## T-48: detectar sin sancionar

En **Moderación → Revisión de contenido**, activar **Detección para revisión humana**. Es independiente del bloqueo automático existente y está desactivada inicialmente para conservar el comportamiento de comunidades anteriores.

- Se observan mensajes de canales ya publicados y sus ediciones, incluyendo textos acompañando recursos. No se clasifican registros de llamadas, hilos históricos ni recursos sin texto propio.
- Se reutilizan las reglas configuradas y el adaptador Decisions. Una probabilidad de al menos 0,8 señala el mensaje; no lo elimina ni aplica medidas al autor.
- Se señala también la tercera repetición y las siguientes del mismo texto, sin distinguir mayúsculas, por la misma persona y canal en una ventana de 60 segundos de publicación. La detección de repetición sigue funcionando aunque el proveedor no responda.
- Cada mensaje tiene como máximo un caso, incluso ante eventos repetidos o trabajos concurrentes. La clasificación vuelve a comprobar el estado antes de guardar: si el texto se editó, eliminó, se retiró la regla o se desactivó la revisión durante la consulta, no conserva ese resultado atrasado.
- El caso guarda referencia, autor, canal, motivos, fechas y estado; no conserva una copia del contenido. El detalle recupera el mensaje actual y avisa si fue editado.
- La revisión se ejecuta después del commit. Una falla del proveedor o de la revisión no revierte un mensaje publicado. El bloqueo automático anterior conserva su propio alcance previo a la publicación: un mensaje rechazado por ese bloqueo no se presenta como mensaje publicado en F-13.

## T-49: bandeja y decisión humana

La bandeja separa **Pendientes** y **Resueltos**, con paginación de 30 casos. Se puede abrir un detalle, actualizar el listado y resolver con un motivo de 3 a 300 caracteres.

- **Descartar señalamiento**: marca el caso DESCARTADO, sin medidas.
- **Cerrar sin sanción**: marca SIN_SANCION, conservando el registro de revisión.
- **Iniciar una medida**: elegir silencio (texto/voz/ambos y duración), expulsión o baneo; comprobar persona y efecto y confirmar expresamente. Usa los servicios manuales F-14 ya existentes. La medida y la resolución se guardan en la misma transacción, con la misma revalidación de autoridad/jerarquía y los efectos en llamadas y accesos.
- Repetir una resolución idéntica no duplica la medida. Dos decisiones diferentes concurrentes generan un conflicto; la interfaz recupera el estado actual. Se registran resolutor, fecha, motivo y medida aplicada.
- Un integrante común o alguien ajeno no puede consultar ni resolver. Se verifica nuevamente el permiso de moderación y la pertenencia de cada caso a su comunidad en cada operación.
- Si se elimina el mensaje/canal o se pierde acceso, el contenido deja de exponerse. Un caso sin contenido disponible puede descartarse o cerrarse sin sanción, pero no iniciar una nueva medida desde ese mensaje. Si el autor ya abandonó la comunidad tampoco se inicia una medida.
- Eliminar una comunidad elimina sus casos. Eliminar físicamente un mensaje conserva el caso sin esa referencia; el borrado lógico muestra contenido no disponible.
- Esta entrega conecta decisiones manuales con F-14. No cambia el generador de propuestas de sanciones T-51/T-52 ni agrega ejecución autónoma de IA.

### API de revisión

| Método | Ruta | Uso |
|---|---|---|
| GET/PATCH | `/api/communities/:id/review/settings` | Consultar o cambiar `{ activa }` |
| GET | `/api/communities/:id/review/cases?estado=PENDIENTE` | Listar; `RESUELTOS` y `cursor` opcionales |
| GET | `/api/communities/:id/review/cases/:caso` | Detalle actual autorizado |
| POST | `/api/communities/:id/review/cases/:caso/resolve` | `{ decision, motivo, medida? }` |

`medida`: `{ tipo: 'EXPULSAR' }`, `{ tipo: 'BANEAR', duracion }` o `{ tipo: 'SILENCIAR', alcance, duracion }`. Se reutilizan los alcances/duraciones de `docs/moderacion.md`. Solo CON_MEDIDA admite y requiere la medida. No se acepta autor/resolutor desde el cliente.

## Base y pruebas

Nueva migración `20261124020000_planes_revision`, posterior a `20261124010000_moderacion_medidas` de main. Quedan **26 migraciones**. Agrega propuestas, casos, el ajuste de revisión y detalle de auditoría. No usar reset ni seed.

```sh
npm run db:generate -w apps/backend
npm run db:deploy -w apps/backend
npm exec -w apps/backend -- prisma migrate status
npm run test:plans-review -w apps/backend
npm run test -w apps/frontend
npm run build -w apps/frontend
```

El backend requiere `TEST_DATABASE_URL` exclusiva de pruebas. Se usa PostgreSQL real aislado y proveedor IA simulado: autorización, ausencia de escrituras durante vista previa, IDs ajenos, ambigüedad, huella, expiración, concurrencia, rollback, detección no punitiva, repetición, resultado atrasado, redacción de contenido eliminado, paginación, jerarquía, medidas y auditoría. Se corrigió el lector SQL de pruebas para no cortar comentarios o literales con punto y coma ni bloques PostgreSQL; los fixtures históricos insertan solo columnas existentes antes de aplicar migraciones posteriores.

La interfaz prueba revisión de cambios, reconocimiento de eliminaciones, cancelación, plan desactualizado, motivos, medidas explícitas, contenido no disponible, pérdida de permisos y recuperación tras conflicto. Quedan para el recorrido del equipo el proveedor/modelo real, aspecto visual en móvil/escritorio y revocación con LiveKit externo.

## Recorrido manual recomendado

1. Como propietario, preparar un plan que cree texto/voz, renombre y reordene. Verificar que nada cambie antes de confirmar. Cancelar y comprobar que se mantenga el catálogo.
2. Preparar otro plan, modificar un canal desde otra sesión y confirmar el anterior: debe pedir una propuesta nueva.
3. Revisar y confirmar una eliminación con su advertencia; comprobar catálogo, historial, llamadas y registro administrativo.
4. Entrar como administrador/integrante: no debe ofrecer Organizar con IA ni permitir sus rutas.
5. Activar revisión humana, con bloqueo automático desactivado. Desde otra cuenta publicar tres mensajes iguales: deben permanecer y aparecer un caso para el tercero.
6. Abrir el caso, descartarlo o cerrarlo sin sanción. Revisar la pestaña Resueltos y el actor/fecha/motivo.
7. En otro caso confirmar silencio temporal, expulsión o baneo; comprobar el efecto real, la jerarquía y que un reintento no duplique nada.
8. Resolver el mismo caso desde dos sesiones y retirar permisos o eliminar el mensaje mientras está abierto; comprobar conflicto y redacción del contenido.
