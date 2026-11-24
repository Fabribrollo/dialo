# Landing pública — T-53

Base revisada: main `1337629`, issue #137. Se conserva la identidad visual y el recorrido WebGL existente; no se modifican comunidades ni se consultan contenidos privados desde la landing.

## Navegación existente, verificada

- Una visita sin sesión a `/` llega a `/inicio`, con registro y login visibles.
- `GuestRoute` ya redirige una sesión activa a `/` o a una invitación válida pendiente. No se agrega un botón ni un flujo de sesión paralelo.
- Las invitaciones mantienen su destino al iniciar sesión, pasar a registro y recargar el formulario; se rechazan destinos externos.
- Título, descripción, Open Graph, fuentes locales y carga diferida de la landing ya estaban implementados y se conservan.

## Ajustes

- Landmark `main` y descripción estable de las cuatro funciones para lectores de pantalla. El canvas y los subtítulos animados quedan decorativos para evitar narraciones repetidas.
- El área del recorrido recibe foco, instrucciones y un indicador visible. Permite el desplazamiento nativo con teclado.
- Los controles de las escenas inicial y final y la navegación dejan de ser interactivos cuando se ocultan. Ya no reciben clics ni foco mientras son transparentes.
- Si el scroll oculta el control enfocado, el foco vuelve al recorrido para poder seguir navegando.
- `Ver cómo es` enfoca el recorrido después de iniciar el desplazamiento.

## Validación automatizada

`npm run test -w apps/frontend`: **456 pruebas aprobadas**. `npm run build -w apps/frontend`: correcto; continúa el aviso de tamaño del paquete LiveKit.

Las pruebas de landing verifican raíz pública, registro/login, contenido accesible, estados inactivos y transferencia de foco, alternativa sin WebGL, movimiento reducido, sesión activa, invitación pendiente y limpieza de título/render al salir. Se ejecutaron además las suites de invitaciones y sesión.

Sin cambios de dependencias, backend, migraciones ni configuración de entorno. Los colores declarados de los textos principales sobre el fondo de la landing superan 4,5:1 en sus estados completamente visibles; esto no sustituye una auditoría de todas las composiciones animadas.

## Recorrido manual pendiente antes de cerrar la issue

La inspección visual con Chromium no pudo ejecutarse en el entorno de esta entrega porque el sistema bloqueó un socket requerido por el navegador. No se declara verificación visual ni prueba en dispositivos reales.

1. Sin sesión: abrir `/`, probar `Entrar` y `Crear cuenta`, y volver con el navegador.
2. Con sesión: abrir `/inicio`; debe entrar directamente a la app. Abrir una invitación sin sesión, completar login o registro y verificar el regreso a esa invitación.
3. Solo teclado: enfocar el recorrido con Tab y avanzar con flechas, Avanzar página y Fin. Al final deben poder enfocarse `Crear cuenta` y `Ya tengo cuenta`; los controles ocultos no deben recibir foco. Volver con Inicio y verificar los controles iniciales.
4. Si se desplaza con rueda mientras un botón tiene foco y ese botón desaparece, debe quedar enfocado el recorrido.
5. Revisar a 320 px, 390 px, escritorio y móvil horizontal: sin texto ni controles cortados, sin desplazamiento horizontal y con foco visible.
6. Activar movimiento reducido en el sistema o las herramientas del navegador. El registro debe abrir sin esperar la animación larga.
7. Si el navegador no dispone de WebGL, comprobar que permanecen el texto alternativo y las acciones de acceso. Con lector de pantalla, recorrer el encabezado y la lista estable de funciones sin depender del canvas.

Cerrar T-53 después de completar este recorrido. La validación móvil integral de la app corresponde a T-54.
