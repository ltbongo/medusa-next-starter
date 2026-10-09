FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json turbo.json ./
COPY apps/backend/package.json apps/backend/
COPY apps/storefront/package.json apps/storefront/
RUN npm ci --include=dev
COPY . .
ENV NODE_ENV=production
ENV DATABASE_URL=postgresql://medusa:medusa@127.0.0.1:5432/medusa
RUN npm run build --workspace=@dtc/backend

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache wget
COPY package.json package-lock.json turbo.json ./
COPY apps/backend/package.json apps/backend/
COPY apps/storefront/package.json apps/storefront/
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=build /app/apps/backend/.medusa/server ./apps/backend/.medusa/server
COPY --from=build /app/apps/backend/src ./apps/backend/src
COPY --from=build /app/apps/backend/medusa-config.js ./apps/backend/medusa-config.js
COPY apps/backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENV HOST=0.0.0.0
ENV PORT=9000
EXPOSE 9000
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:9000/health || exit 1
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
