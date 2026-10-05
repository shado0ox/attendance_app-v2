# --- Build stage -----------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

# Install deps first so this layer is cached unless package*.json changes
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the source and build both the frontend (vite) and the
# bundled server (esbuild) into /app/dist
COPY . .
RUN npm run build

# --- Runtime stage -----------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache postgresql-client

# node_modules is copied whole (not pruned to --omit=dev) because server.ts
# has a top-level `import ... from 'vite'` that still executes in production
# even though the vite dev-server branch itself is skipped. If that import is
# ever made conditional/dynamic, this can switch to a `npm ci --omit=dev` copy
# to shrink the image.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3011/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
EXPOSE 3011
CMD ["node", "dist/server.cjs"]
