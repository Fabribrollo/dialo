# Moderación de integrantes (F-14)

T-50 completa las medidas manuales; T-51 y T-52 agregan un asistente que prepara la medida con IA y la deja lista para confirmar.

## Medidas

| Medida | Qué hace | Quién | Se levanta |
| --- | --- | --- | --- |
| Silenciar | Sigue en la comunidad y puede leer. **Texto**: no escribe, reacciona ni vota. **Voz**: no usa micrófono, cámara ni pantalla; en una llamada activa se le corta al aplicar. **Ambos**: las dos cosas. | Propietario, administradores y roles con el permiso *Silenciar* | Al vencer (15 min, 1 h, 24 h, 7 días) o a mano. *Sin vencimiento* dura hasta que alguien lo levante |
| Expulsar | Retira la membresía, los roles y el acceso; sale de la llamada. Puede volver con una invitación válida | Propietario y administradores | — |
| Banear | Como expulsar, y además bloquea el reingreso aunque tenga invitación | Propietario y administradores | Al vencer (30 min, 5 h) o a mano desde *Ver baneos* |

Todas se aplican en el servidor y solo afectan a esa comunidad.

### Jerarquía

- Nadie se aplica una medida a sí mismo ni al propietario.
- Solo el propietario actúa sobre administradores. Los administradores no se silencian: conservan sus permisos.
- Solo la administración actúa sobre moderadores.

### Cómo se aplica el silencio

`silencio_comunidad` guarda un silencio por integrante y comunidad (alcance, vencimiento, motivo y autor). Los permisos efectivos de cada canal lo descuentan (`utils/channelPermissions.js`), así que el mismo cálculo que autoriza mensajes, reacciones y llamadas lo respeta. Al aplicarlo o levantarlo se publican los cambios de acceso: el cliente recibe el canal actualizado y LiveKit pierde el permiso de publicar el micrófono. El vencimiento se compara con la hora actual en cada consulta; un temporizador además borra el registro y avisa a la interfaz. Al reiniciar el backend se reprograman los pendientes.

### Auditoría

Cada medida escribe en `auditoria` el actor real y una descripción sin contenido de mensajes, por ejemplo `Silenció a @beto (texto, 1 hora). Motivo: spam` o `Con IA: Baneó a @caro (5 horas)`. Estas rutas no pasan por la auditoría genérica para no duplicar entradas.

## Moderar con IA (T-51, T-52)

En **Integrantes**, quien puede silenciar ve *Moderar con IA*. Escribe un pedido como "silenciá a @beto en el chat por una hora, está haciendo spam" y obtiene una vista previa con la persona, la medida, la comunidad, el motivo y sus efectos.

1. **Preparar** (`POST /api/communities/:id/moderation/proposals`, body `{ pedido, idDestinatario? }`). La IA solo interpreta el texto con Structured Outputs; Dialo busca a la persona entre los integrantes actuales y verifica permisos y jerarquía. No cambia membresías, permisos ni llamadas.
   - `LISTA`: propuesta guardada, confirmable, vence a los 10 minutos.
   - `AMBIGUO`: varias coincidencias; la interfaz pide elegir y vuelve a preparar con `idDestinatario`.
   - `NO_PERMITIDA`: la medida excede los permisos de quien la pide; se muestra pero no se puede confirmar.
   - Errores: `422 TARGET_NOT_FOUND` o `NO_MEASURE`, `503 AI_UNAVAILABLE`, `429 RATE_LIMITED` (5 por minuto).
2. **Confirmar** (`POST …/proposals/:idPropuesta/confirm`). Solo quien la preparó. Revalida permisos y jerarquía dentro de la transacción de la medida y marca la propuesta como confirmada ahí mismo: una segunda confirmación responde `409` y no repite la medida. Si venció responde `410`; si perdió permisos, `403` y la propuesta sigue pendiente.
3. **Cancelar** (`POST …/proposals/:idPropuesta/cancel`). La propuesta queda cancelada y se audita.

`propuesta_moderacion` registra solicitante, confirmador, destinatario, medida, alcance, duración, motivo, estado y fechas.

La integración con la bandeja de revisión de contenido (F-13) queda para cuando esa feature esté en `main`: la propuesta podrá referenciar el caso y actualizarlo al confirmar.

## API manual

| Método | Ruta | Body |
| --- | --- | --- |
| `GET` | `/api/communities/:id/silences` | — |
| `PUT` | `/api/communities/:id/members/:idUsuario/silence` | `{ alcance: TEXTO\|VOZ\|AMBOS, duracion: 15_MIN\|1_HORA\|24_HORAS\|7_DIAS\|PERMANENTE, motivo? }` |
| `DELETE` | `/api/communities/:id/members/:idUsuario/silence` | — |
| `POST` | `/api/communities/:id/members/:idUsuario/kick` | `{ motivo? }` |
| `PUT` / `DELETE` | `/api/communities/:id/bans/:idUsuario` | `{ duracion?, motivo? }` |

`GET /api/communities/:id` incluye `miSilencio` (alcance y vencimiento) para explicar en el canal por qué no se puede escribir. El evento `community:moderation-members-changed` avisa a la comunidad y a la persona afectada.

## Pruebas

```sh
npm run test:moderation-rules -w apps/backend   # reglas puras, sin base
TEST_DATABASE_URL=… npm run test:moderation -w apps/backend
```
