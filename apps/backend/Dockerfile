# Backend de Dialo. Se construye desde la raíz del repo (monorepo con workspaces).
FROM node:22-bookworm-slim

# Prisma necesita OpenSSL en tiempo de ejecución.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
# Incluye prisma (CLI) para generar el cliente y aplicar migraciones con el mismo contenedor.
RUN npm ci --workspace @dialo/backend --include-workspace-root=false --no-audit --no-fund

COPY apps/backend apps/backend
RUN npx --workspace @dialo/backend prisma generate

WORKDIR /app/apps/backend
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
USER node
CMD ["node", "src/index.js"]
