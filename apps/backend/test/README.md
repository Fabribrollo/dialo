# Pruebas de conversaciones privadas (T-10)

Estas pruebas ejercitan las cuatro rutas HTTP con sesiones reales, Prisma y una base compatible con PostgreSQL. También verifican el evento `conversation:new` mediante clientes Socket.IO.

## Ejecución

1. Desde la raíz del repositorio, ejecutar `npm ci` y `npm run db:generate -w apps/backend`.
2. Configurar `TEST_DATABASE_URL` con una conexión **exclusiva de pruebas**, accesible directamente y con permiso para crear schemas. No usar la conexión de producción.
3. Ejecutar `npm run test:conversations -w apps/backend`.

Ejemplo en PowerShell, reemplazando la conexión por la de una base de pruebas:

```powershell
$env:TEST_DATABASE_URL = "postgresql://USUARIO:CONTRASENA@HOST/BASE_DE_PRUEBAS?sslmode=require"
npm run test:conversations -w apps/backend
Remove-Item Env:TEST_DATABASE_URL
```

El test no utiliza `DATABASE_URL` del `.env`. Crea un schema `test_t10_<identificador aleatorio>`, ejecuta allí el SQL de la migración inicial (incluidas sus restricciones e índices), genera cuentas de prueba y elimina únicamente ese schema al finalizar. Si se interrumpe el proceso abruptamente, el schema temporal puede quedar pendiente de limpieza manual. Si se modifica el modelo mediante nuevas migraciones, deberá actualizarse la preparación de este schema de pruebas.

## Cobertura

- Autenticación de todas las rutas con cookies y rechazo del acceso de desarrollo en producción.
- Creación, reutilización y par ordenado de participantes.
- Validación de IDs, límites y cursores.
- Rechazo de conversación propia, sin amistad y acceso de terceros.
- Creación concurrente: una barrera fuerza lecturas iniciales vacías; la restricción SQL real resuelve las escrituras del mismo par.
- Evento personalizado, varias pestañas, unión a rooms y ausencia de eventos duplicados al reutilizar.
- Listado propio, orden por actividad y datos públicos.
- Historial conservado y escritura deshabilitada al eliminar amistad.
- Ocultación de contenido eliminado e identidad invisible.
- Paginación por fecha e ID, fechas iguales, inserciones entre páginas y fin del historial.

El envío, edición y eliminación por sockets pertenecen a T-11; esta suite no acredita esas operaciones.
