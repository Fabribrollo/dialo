# Interfaz de Dialo: T-12 y estilo compartido

## Objetivo y alcance

La interfaz integra las conversaciones privadas de T-10 con la mensajería de T-11, utilizando la sesión real de la app. También unifica la presentación de acceso, registro, recuperación de contraseña, perfil, amigos y solicitudes.

El backend, el modelo y los contratos HTTP/socket se conservan. El único `SocketProvider` existente sigue siendo responsable de abrir y cerrar la conexión. Se reinicia al cambiar la identidad autenticada; no se crean conexiones por conversación.

## Navegación y presentación

- `/`: lista de conversaciones y estado inicial.
- `/conversaciones/:id`: detalle e historial del chat.
- `/amigos`: buscador, solicitudes y amigos; el botón Conversar obtiene o crea un chat y lo abre.
- `/perfil`: perfil, foto y disponibilidad.
- `/login`, `/register`, `/forgot-password`, `/reset-password`: formularios con presentación común.

La navegación autenticada comparte una barra lateral, identidad y estado de conexión. En celular la navegación se presenta al pie y se alterna entre la lista y el chat, con regreso a conversaciones. Las pantallas usan fondos claros, una navegación verde oscuro, acentos suaves, tarjetas, avatares y estados de disponibilidad.

Los estilos viven en `styles.css` y `styles-chat.css`, con variables CSS compartidas y ajustes responsive a 1000 y 700 píxeles. No se agregó una biblioteca de componentes ni fuentes remotas.

## Integración de datos

`ConversationsProvider` conserva el listado, lo ordena por actividad y procesa eventos de conversaciones, mensajes, perfil y amistad. Las consultas HTTP se identifican para evitar que una respuesta anterior revierta un evento más reciente. Una respuesta tardía de detalle tampoco debe rehabilitar la escritura tras eliminar amistad.

`useMessages` consulta páginas de 30 mensajes y las presenta por fecha e ID en orden cronológico. HTTP, ack y eventos se unifican por ID. Los mensajes eliminados conservan contenido nulo y no se restauran con respuestas antiguas. Las solicitudes pendientes se invalidan al cambiar de conversación o desmontar.

Después de reconectar se recuperan listado e historial reciente mediante HTTP. Los mensajes anteriores siguen disponibles mediante paginación. El historial reciente se vuelve a cargar; no se mantiene indefinidamente toda la colección antigua en memoria. Los listeners se retiran con las mismas referencias con las que fueron registrados.

## Mensajes y errores

- El autor se resuelve por `idAutor`, utilizando el usuario propio o el otro participante; se muestra nombre visible, identificador y fecha.
- Envío con Enter; Shift + Enter agrega una línea. El límite es de 2000 caracteres y el envío se deshabilita si no hay conexión o amistad.
- El borrador se conserva al perder conexión o fallar el ack. Si se escribe texto nuevo mientras espera el ack, no se elimina al confirmar el texto anterior.
- Solo los mensajes propios ofrecen edición y eliminación. La eliminación requiere confirmación en un diálogo nativo.
- Un timeout no implica que la escritura haya fallado: se consulta el historial y se indica revisarlo antes de reintentar. T-11 no tiene un identificador de idempotencia de envíos; reintentar un envío no confirmado podría generar otro mensaje.
- `friend:removed` deshabilita nuevos envíos y conserva el historial. Volver a aceptar amistad actualiza el listado desde HTTP.
- `user:updated` actualiza la identidad del participante. Para el usuario propio se consulta su perfil, porque su disponibilidad pública puede ocultar el estado Invisible.
- `UNAUTHORIZED` vuelve a comprobar la identidad autenticada. Las fallas de transporte muestran el estado de reconexión.

Los controles incluyen etiquetas, foco visible, acceso por teclado, enlace para saltar al contenido, estados de carga y errores con `role="alert"`. El diálogo de confirmación utiliza el comportamiento de foco y Escape del navegador. No se afirma una certificación de accesibilidad completa.

## Pruebas automatizadas

Desde la raíz:

```powershell
npm ci
npm run test -w apps/frontend
npm run build -w apps/frontend
```

La suite usa Vitest, Testing Library y jsdom. No utiliza la base del equipo ni requiere el backend en ejecución: HTTP y sockets se simulan de forma controlada para verificar carreras y estados.

Cobertura: deduplicación, orden cronológico, redacción irreversible de contenido eliminado, errores de ack y desconexión, eventos ajenos, cambio rápido de chat, HTTP pendiente, paginación, reconexión, limpieza de listeners, escritura tras eliminar amistad, cambios de identidad, controles propios, confirmación/cancelación, teclado y conservación de borradores.

Además se verificó el flujo completo en Chromium con dos sesiones, el backend y PostgreSQL embebido en un schema local aislado. Esa ejecución no utilizó Neon ni las credenciales del equipo.

## Verificación manual en la instancia del equipo

1. Ejecutar `npm run db:generate -w apps/backend` y `npm run dev`.
2. Abrir `http://localhost:5173`. Con sesiones reales, `VITE_DEV_USER_ID` debe estar vacío.
3. Usar una ventana normal y otra privada para dos cuentas distintas. Pueden registrarse desde la interfaz; anotar sus contraseñas fuera de la conversación.
4. Desde Amigos, buscar el identificador de la otra cuenta, enviar solicitud y aceptarla en la segunda ventana.
5. Elegir Conversar. En la otra cuenta, abrir el chat del listado.
6. Intercambiar mensajes: deben aparecer una vez en ambas ventanas. Editar un mensaje propio y confirmar su eliminación; comprobar los cambios en la segunda cuenta.
7. Recargar el chat y verificar que persistan los cambios. Con más de 30 mensajes, cargar anteriores y comprobar el orden.
8. Actualizar nombre visible o foto mientras sigue habiendo amistad: el otro participante debe ver la identidad actualizada. El backend emite cambios de perfil a amigos actuales; no promete actualizarlos en tiempo real después de eliminar amistad.
9. Eliminar la amistad desde Amigos: el historial permanece y nuevos envíos se deshabilitan. Los mensajes propios anteriores todavía pueden editarse o eliminarse según T-11.
10. Detener el backend mientras se compone un texto: debe conservarse. Reiniciarlo, esperar reconexión y comprobar la recuperación de datos.
11. Comprobar edición, envío, cancelación y confirmación mediante teclado; repetir en una ventana angosta.
12. Cerrar sesión desde la navegación o el perfil: el chat deja de estar disponible y la conexión se limpia.

Para comprobar T-11 independientemente del navegador sigue disponible `npm run smoke:messages -w apps/backend`; ese comando crea sus propias cuentas de prueba, no reutilizables desde la interfaz porque sus contraseñas son aleatorias.
# Comunidades (T-18)

Interfaz funcional y sencilla sobre los componentes y colores existentes. La
integración visual completa de comunidades, canales y chats corresponde a T-27.

## Rutas

- `/comunidades`: listado de comunidades propias y acceso a creación.
- `/comunidades/nueva`: creación con nombre, tipo e imagen opcional.
- `/comunidades/:id`: detalle, rol propio y acciones autorizadas.
- `/comunidades/:id/editar`: edición de nombre, tipo e imagen.

Se reutiliza el único SocketProvider de la app. CommunitiesProvider se monta al
entrar en esta sección, consulta el listado y consume eventos de comunidad,
membresía y reconexión. Al salir se limpian sus listeners. La consulta de detalle
valida el acceso con HTTP y descarta respuestas de rutas anteriores.

`community:updated` no incluye `miRol`; se conserva el rol propio y se reconsulta
el detalle. Los eventos de eliminación y abandono retiran el contenido abierto y
vuelven al listado. Al reconectar se recuperan los datos por HTTP.

ADMIN y PROPIETARIO pueden editar. Solo PROPIETARIO ve la eliminación, que exige
confirmación en un diálogo con foco inicial en Cancelar. El backend sigue siendo
la autoridad para todas las operaciones. Un 403/404 no revela el detalle privado.

La imagen admite JPG, PNG y WebP de hasta 2 MB, con previsualización local y
liberación de sus object URLs. La API recibe multipart con el campo `imagen`.
Crear/editar datos y cargar imagen son operaciones separadas: si solo falla la
imagen se informa el guardado parcial y se conserva el ID para reintentar sin
crear otra comunidad. Durante el guardado se bloquean envíos repetidos.

Los errores conservan el borrador. Una actualización remota no reemplaza los
campos en edición. Una pérdida de acceso retira el contenido de la vista.

## Alcance de esta tarea

T-18 no agrega explorador público, invitaciones, integrantes ni canales a la UI.
Las invitaciones y los integrantes se integrarán en T-21. El tipo PUBLICA se
puede guardar con la API actual; el explorador y el ingreso directo necesitan
completar sus rutas de backend antes de exponerlos en pantalla.

No modifica el schema, las dependencias, el archivo de entorno ni la identidad de
desarrollo. Las pruebas frontend se ejecutan con `npm run test -w apps/frontend`.
