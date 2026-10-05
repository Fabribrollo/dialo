# Dialo

App de mensajería tipo Discord: cuentas, amigos y conversaciones privadas en tiempo real.

Stack: React + Vite · Express · Prisma · PostgreSQL (Neon) · socket.io

## Estructura

```
apps/
├── backend/    API REST + socket.io
└── frontend/   React + Vite
```

## Puesta en marcha

Requiere Node 22 o superior.

1. Instalar dependencias desde la raíz (instala las dos apps):

   ```
   npm install
   ```

2. Copiar `apps/backend/.env.example` como `apps/backend/.env` y completar las URLs de Neon (cada uno usa su propio branch).

3. Aplicar las migraciones:

   ```
   npm run db:migrate
   ```

4. Levantar back y front juntos:

   ```
   npm run dev
   ```

   - Front: http://localhost:5173
   - API: http://localhost:3000/api/health

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | back y front en paralelo |
| `npm run dev:back` / `npm run dev:front` | uno solo |
| `npm run db:migrate` | crea y aplica migraciones a partir del schema |
| `npm run db:studio` | abre Prisma Studio |
| `npm run db:seed` | carga datos de prueba |
| `npm install <paquete> -w apps/backend` | agrega una dependencia a una app |
