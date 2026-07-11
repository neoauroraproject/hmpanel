# ─────────────────────────────────────────────────────────────────
# Stage 1: Dependencies
# ─────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Install system dependencies required by Prisma and node-gyp
RUN apk add --no-cache libc6-compat python3 make g++ openssl

# Copy root package files and Prisma schema
COPY package*.json ./
COPY VERSION ./
COPY prisma ./prisma/

# Copy workspace package files
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install all dependencies
RUN npm install --legacy-peer-deps
RUN cd backend && npm install --legacy-peer-deps
RUN cd frontend && npm install --legacy-peer-deps

# Generate Prisma Client
RUN npx prisma generate

# ─────────────────────────────────────────────────────────────────
# Stage 2: Build
# ─────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install system dependencies for build
RUN apk add --no-cache libc6-compat openssl

# Copy installed dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY --from=deps /app/frontend/node_modules ./frontend/node_modules

# Copy prisma
COPY prisma ./prisma/
COPY package*.json ./
COPY VERSION ./

# Copy backend source
COPY backend ./backend

# Build backend
RUN cd backend && npm run build

# Copy frontend source
COPY frontend ./frontend

# Build frontend (Next.js standalone)
ENV NEXT_TELEMETRY_DISABLED=1
RUN cd frontend && npm run build

# Validate no hardcoded localhost
RUN if grep -r "127.0.0.1:4000" frontend/.next/static/; then \
      echo "ERROR: Hardcoded 127.0.0.1:4000 found in production bundle!"; \
      exit 1; \
    fi

# ─────────────────────────────────────────────────────────────────
# Stage 3: Production Runner
# ─────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

ARG APP_VERSION=unknown

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install minimal runtime dependencies
RUN apk add --no-cache openssl curl tini postgresql-client docker-cli bash socat tar

# Add non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 panelapp

# ── Root (Prisma client) ──────────────────────────────────────────
COPY --from=builder /app/package.json ./
COPY --from=builder /app/VERSION ./VERSION
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma

LABEL org.opencontainers.image.version="${APP_VERSION}"

# ── Backend artifacts ─────────────────────────────────────────────
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/package.json ./backend/package.json
COPY --from=builder /app/backend/node_modules ./backend/node_modules

# ── Frontend artifacts (standalone) ──────────────────────────────
COPY --from=builder /app/frontend/.next/standalone ./frontend/
COPY --from=builder /app/frontend/.next/static ./frontend/frontend/.next/static
COPY --from=builder /app/frontend/public ./frontend/frontend/public

# ── Persistent data directories ───────────────────────────────────
RUN mkdir -p /app/uploads /app/backups /app/logs

# ── Startup script ────────────────────────────────────────────────
# Backend runs in a restart loop so premium bundle updates can exit the Node
# process and pick up new lazy-loaded modules (Nest cannot unload them in-place).
RUN printf '%s\n' \
  '#!/bin/sh' \
  'set -e' \
  'if [ -f /app/VERSION ]; then export APP_VERSION="$(tr -d \"\\r\\n\" < /app/VERSION)"; fi' \
  'echo "[HMPanel] Cleaning up DB..."' \
  'node backend/dist/scripts/cleanup-dups.js || true' \
  'node backend/dist/scripts/upgrade-legacy-store-schema.js || true' \
  'echo "[HMPanel] Running database migrations..."' \
  'npx prisma db push --schema=/app/prisma/schema.prisma --accept-data-loss' \
  'set +e' \
  '(' \
  '  while true; do' \
  '    echo "[HMPanel] Starting backend API on port ${BACKEND_PORT:-4000}..."' \
  '    PORT=${BACKEND_PORT:-4000} node backend/dist/main.js' \
  '    code=$?' \
  '    echo "[HMPanel] Backend exited (code $code) — restarting in 2s to reload premium modules..."' \
  '    sleep 2' \
  '  done' \
  ') &' \
  'echo "[HMPanel] Starting frontend on port ${APP_PORT:-3000}..."' \
  'PORT=${APP_PORT:-3000} HOSTNAME=0.0.0.0 node frontend/frontend/server.js &' \
  'wait' \
  > /app/start.sh && chmod +x /app/start.sh

EXPOSE 3000 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://127.0.0.1:4000/health || exit 1

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/app/start.sh"]
