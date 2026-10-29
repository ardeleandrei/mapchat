# Build Vue frontend
FROM node:24-bookworm-slim AS web-build
WORKDIR /build/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# Compile Node backend
FROM node:24-bookworm-slim AS server-build
WORKDIR /build/backend

COPY backend/package.json backend/package-lock.json ./
RUN npm ci

COPY backend/ ./
RUN npm run build

# Install backend runtime dependencies
FROM node:24-bookworm-slim AS server-deps
WORKDIR /build/backend

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# Production runtime
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app/backend

COPY --from=server-deps --chown=node:node /build/backend/package.json ./
COPY --from=server-deps --chown=node:node /build/backend/node_modules ./node_modules
COPY --from=server-build --chown=node:node /build/backend/dist ./dist
COPY --from=web-build --chown=node:node /build/frontend/dist ./public

USER node
EXPOSE 3000

CMD ["node", "dist/index.js"]