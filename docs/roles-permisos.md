# Roles y permisos

## Autoridad

Los roles base asignables son PROPIETARIO, ADMIN e INTEGRANTE. Moderador solo permanece como valor histórico de base: las migraciones convierten esas membresías a integrantes y conservan capacidades compatibles en un rol personalizado.

Propietario y administradores conservan acceso completo a todos los canales. Un administrador puede promover integrantes, pero no borrar ni transferir la comunidad, quitar ADMIN, expulsar o banear a otro administrador. Solo el propietario puede modificar a otro administrador. Nadie actúa sobre sí mismo mediante estos controles.

## Capacidades configurables

| Grupo | Permiso | Alcance |
| --- | --- | --- |
| Base | ESCRIBIR | Mensajes propios y adjuntos en texto |
| Base | HABLAR | Micrófono de llamada |
| Base | CAMARA | Cámara de llamada |
| Base | PANTALLA | Compartir pantalla |
| Especial | ELIMINAR_MENSAJES | Mensajes ajenos en texto, respetando jerarquía |
| Especial | SILENCIAR | Imponer/levantar silencio persistente de micrófono en voz |
| Especial | GESTIONAR_CANALES | Crear/ordenar canales; editar/eliminar/configurar canales autorizados |
| Especial | EXPULSAR | Retirar acceso al canal, sin borrar membresía ni historial |

VER es una condición interna de acceso, nunca un checkbox configurable. Un canal público con globales vacíos permite leer/escuchar. Un privado exige admisión individual, incluso si la persona tiene un rol personalizado. Retirar acceso se hace con expulsión o retirando su admisión privada.

BANEAR, gestión de comunidad, invitaciones, roles y moderación son acciones de ADMIN/PROPIETARIO. No son capacidades delegables en roles personalizados. Las validaciones rechazan permisos inventados o administrativos. TRANSMITIR histórico se interpreta como cámara y pantalla; la interfaz los configura por separado.

## Herencia y admisión

La privacidad y el tipo quedan fijos al crear. Los públicos definen sus globales de ambas categorías en esa operación; después se pueden actualizar sus capacidades. No tienen selector de personas ni excepciones por rol. Los roles personalizados se configuran una vez en la comunidad y suman íntegramente sus capacidades aplicables en cada canal accesible.

En privados, solo administración admite personas manualmente o acepta/rechaza solicitudes. Los demás integrantes ven nombre/tipo bloqueados y pueden pedir acceso, sin recibir mensajes, adjuntos, vistas previas ni llamadas. Tras la admisión se suman los permisos individuales y todos sus roles. No existe una excepción que recorte un rol heredado.

Expulsar de un público crea una exclusión explícita; Restaurar acceso la elimina. Expulsar de un privado retira su admisión y permite una nueva solicitud. Salir/echar de la comunidad es una operación distinta, reservada a administración. Silenciar quita únicamente HABLAR, incluso si lo concede un rol, sin cortar cámara/pantalla; se mantiene tras reconectar. Administración conserva su micrófono.

## Contratos

- POST/PATCH `/api/communities/:id/roles[/:idRol]`: `{nombre,permisos?}`. Omitir capacidades en PATCH las conserva; una lista vacía las quita. Catálogo cerrado de ocho valores, nombre único de 1–32 caracteres.
- POST `/api/communities/:id/roles/suggestion`: `{descripcion}`. Propuesta `{nombre,permisos,resumen}` validada, sin guardar automáticamente; sin proveedor devuelve AI_UNAVAILABLE y permite configurar manualmente.
- PATCH `/api/communities/:id/members/:user`: `{rol?,idsRoles?}`, ADMIN/INTEGRANTE y hasta 50 roles de esa comunidad.
- PUT `/api/channels/:id/access`: público `{privado:false,permisosGlobales:[]}` o privado `{privado:true,habilitaciones:[{idUsuario,permisos:[]}]}`. La lista vacía individual admite solo lectura, además de lo heredado. VER se añade internamente. Hasta 50 admisiones; `roles` no admite elementos. La privacidad debe coincidir.
- POST `/api/channels/:id/members/:user/kick` o `/restore`: `{}`, requiere EXPULSAR. Restaurar corresponde a exclusiones públicas; en privados se vuelve a admitir desde Integrantes o Solicitudes.
- POST `/api/channels/:id/members/:user/silence`: `{silenciado:boolean}`, requiere SILENCIAR y canal VOZ.
- GET `/api/channels/:id/members/management`: perfiles públicos gestionables, estado de silencio/expulsión; excluye objetivos protegidos.
- POST `/api/communities/:id/members/:user/kick`: salida de toda la comunidad, solo administración.
- PUT `/api/communities/:id/bans/:user`: `{motivo?,duracion:"30_MIN"|"5_HORAS"|"PERMANENTE"}`. Omitir duración conserva compatibilidad permanente. Solo administración; los baneos activos repetidos no se duplican.

Un baneo expira realmente según `fechaVencimiento`. Al vencer, la persona puede volver mediante el flujo normal de ingreso; no se restaura membresía automáticamente. Los listados excluyen vencidos y las comprobaciones de ingreso eliminan el registro vencido bajo el bloqueo de comunidad. Levantar manualmente tampoco restaura membresía.

## Migración y consistencia

`20261121190000_armonia_chat` materializa admisiones privadas antiguas por rol, conserva denegaciones individuales públicas como expulsiones explícitas y retira las excepciones por rol. Filtra las capacidades personalizadas al catálogo actual, por lo que deja de delegarse BANEAR. No borra mensajes, amistades ni comunidades.

Las mutaciones de acceso/roles/admisión/silencio se serializan con el bloqueo de comunidad. La transacción calcula audiencias y avisos; después del commit se publican eventos y se revocan suscripciones/fuentes de LiveKit. Eliminar una capacidad no la restaura al reconectar. Estas comprobaciones están en el servidor, además de la interfaz.
