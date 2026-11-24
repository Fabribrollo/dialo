# Frontend de Dialo: build estático de Vite servido por nginx, que además
# reenvía /api y /socket.io al backend. Todo queda en un mismo origen.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
RUN npm ci --workspace @dialo/frontend --include-workspace-root=false --no-audit --no-fund
COPY apps/frontend apps/frontend
RUN npm run build --workspace @dialo/frontend

FROM nginx:1.27-alpine
COPY apps/frontend/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html
EXPOSE 80
