# Build Vue frontend
FROM node:24-bookworm-slim AS web-build
WORKDIR /build/web

COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/ ./
RUN npm run build

# Compile Node backend
FROM node:24-bookworm-slim AS server-build
WORKDIR /build/server

COPY server/package.json server/package-lock.json ./
RUN npm ci

COPY server/ ./
RUN npm run build

# Install backend runtime dependencies
FROM node:24-bookworm-slim AS server-deps
WORKDIR /build/server

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# Production runtime
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app/server

COPY --from=server-deps --chown=node:node /build/server/package.json ./
COPY --from=server-deps --chown=node:node /build/server/node_modules ./node_modules
COPY --from=server-build --chown=node:node /build/server/dist ./dist
COPY --from=web-build --chown=node:node /build/web/dist ./public

USER node
EXPOSE 3000

CMD ["node", "dist/index.js"]