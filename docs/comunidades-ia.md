# T-44 y T-45: creación asistida de comunidades

Desde **Comunidades → Crear comunidad → Ayudarme con IA**, una cuenta autenticada describe el propósito (10 a 1200 caracteres) y genera un borrador. Generar, descartar o cancelar no escribe comunidades, canales, roles ni recibos.

## Revisión

- Propuesta con nombre, privacidad, de 1 a 20 canales TEXTO/VOZ y hasta 10 roles personalizados. El arreglo de canales determina su orden inicial.
- Se puede editar nombre/privacidad, agregar o quitar canales y roles, cambiar tipo/privacidad/permisos y subir/bajar canales. Las admisiones de canales privados se gestionan después de crear la comunidad.
- Los roles quedan sin asignar. La cuenta autenticada recibe PROPIETARIO. No se aceptan IDs, membresías, roles base ni permisos administrativos en el borrador.
- La IA solo puede sugerir ESCRIBIR, HABLAR, CAMARA y PANTALLA, según tipo. La persona puede elegir permisos especiales existentes durante la revisión, como en el CRUD manual; nunca BANEAR ni las acciones exclusivas de administración.
- Regenerar reemplaza la propuesta IA y su nombre/privacidad. Volver a mano recupera el nombre/privacidad del formulario manual; volver a IA recupera su propio borrador. La imagen se conserva.
- Las respuestas tardías después de salir o descartar se ignoran.

## Confirmación

**Confirmar y crear comunidad** vuelve a validar el borrador y crea comunidad, propietario, canales, roles y recibo en una sola transacción. Crea exactamente los canales revisados, sin agregar otro `general`. El flujo manual conserva su canal `general`.

Si se pierde la respuesta, se conserva el envío y se bloquea la edición hasta reintentar. El reintento recupera la comunidad confirmada sin duplicarla. El doble clic también se protege en interfaz y servidor. El evento de comunidad nueva se publica después del commit, exclusivamente al propietario y una vez por confirmación nueva.

La imagen utiliza la subida existente, posterior a crear la estructura. Si falla o es bloqueada, la comunidad creada se conserva y se puede corregir la imagen o continuar sin ella; no se repite la creación.

## API

`POST /api/communities/suggestion`

```json
{"proposito":"Un grupo para estudiar programación y compartir recursos"}
```

Devuelve `200 { propuesta: { nombre, tipo, canales, roles } }`. Cinco solicitudes por minuto y cuenta; `429` al superar la cuota. Sin proveedor/modelo, respuesta rechazada/incompleta/incorrecta o caída: `503 AI_UNAVAILABLE`, con alternativa manual. Solo se envía el propósito al proveedor, con `store: false`; no se consulta ni se envía contenido de comunidades existentes.

`POST /api/communities/from-draft`

```json
{
  "clave":"c5da26ad-fce4-4872-96a9-c1df0b1363ad",
  "borrador":{
    "nombre":"Club de programación",
    "tipo":"PRIVADA",
    "canales":[{"nombre":"consultas","tipo":"TEXTO","privado":false,"permisosGlobales":["ESCRIBIR"]}],
    "roles":[{"nombre":"Estudiantes","permisos":["ESCRIBIR"]}]
  }
}
```

Devuelve `201 { comunidad, repetida: false }` o `200 { comunidad, repetida: true }`. Se reutiliza el UUID para reintentos del mismo envío, separado por cuenta. Modificar una clave ya confirmada devuelve `409 CREATION_KEY_CONFLICT`. Si se eliminó la comunidad o la cuenta dejó de ser propietaria: `409 CREATION_UNAVAILABLE`. La clave no permite consultar creaciones de otra cuenta.

## Configuración y migración

Se reutilizan `OPENAI_API_KEY` y `OPENAI_GENERATION_MODEL` en el backend. El modelo configurado debe soportar Responses con Structured Outputs. No hay claves en el cliente ni dependencias nuevas. Sin configurar IA sigue disponible la creación manual.

La migración `20261123040000_comunidad_propuesta` agrega `creacion_comunidad`: clave por autor, huella SHA-256, ID de comunidad y fecha. No almacena propósito ni respuesta completa. El recibo se conserva al borrar la comunidad para evitar recrearla al reintentar; se elimina en cascada al borrar la cuenta. Quedan **24 migraciones**. Aplicar con deploy, sin reset ni seed.

```sh
npm run db:generate -w apps/backend
npm run db:deploy -w apps/backend
npm exec -w apps/backend -- prisma migrate status
```

## Verificación

```sh
# TEST_DATABASE_URL debe apuntar a una PostgreSQL exclusiva de pruebas.
npm run test:community-proposals -w apps/backend
npm run test -w apps/frontend
npm run build -w apps/frontend
```

Las pruebas integradas usan API, sesiones y PostgreSQL reales aislados, con proveedor IA simulado. Cubren autenticación, validación de entrada/salida, cuota, falta de configuración, respuestas inválidas, flujo manual, creación revisada, límites/nombres/permisos, aislamiento de autores, concurrencia, reintento tras borrado y rollback al fallar roles. La interfaz cubre edición/orden, descarte, restauración manual, respuesta tardía y reintento idéntico tras pérdida de conexión. No acreditan solicitudes a OpenAI real ni aspecto visual en dispositivos físicos.

## Recorrido manual

1. Entrar en Crear comunidad. Completar un nombre manual y pasar a IA.
2. Describir el propósito y generar; comprobar que todavía no aparece una comunidad en el listado.
3. Editar nombre, reordenar/agregar/quitar canales, elegir texto/voz, privacidad y permisos; ajustar roles.
4. Volver a mano y comprobar el nombre original. Regresar a IA y comprobar su borrador.
5. Descartar, regenerar y confirmar una vez. Comprobar canales en orden, roles sin asignar y propiedad de la cuenta.
6. Sin configurar IA, comprobar el aviso y crear manualmente.
7. Si se interrumpe la conexión al confirmar, reintentar el mismo envío y verificar una sola comunidad.

Fuera de alcance: cambios sobre comunidades existentes (T-46/T-47), revisión de contenido y sanciones (T-48 a T-52), rediseño T-43 y cierre de landing T-53.
