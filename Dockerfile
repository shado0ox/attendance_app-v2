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

# node_modules is copied whole (not pruned to --omit=dev) because server.ts
# has a top-level `import ... from 'vite'` that still executes in production
# even though the vite dev-server branch itself is skipped. If that import is
# ever made conditional/dynamic, this can switch to a `npm ci --omit=dev` copy
# to shrink the image.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

EXPOSE 3000
CMD ["node", "dist/server.cjs"]
