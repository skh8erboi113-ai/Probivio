# =============================================================================
# Streamline Probate Engine — Multi-stage Docker build
# Target: Google Cloud Run (Alpine Linux, minimal attack surface)
# =============================================================================

# ─── Stage 1: Base ────────────────────────────────────────────────────────────
FROM node:23.3.0-alpine3.19 AS base

# Install security updates
RUN apk update && apk upgrade --no-cache && \
    apk add --no-cache \
      dumb-init \
      curl \
    && rm -rf /var/cache/apk/*

# Non-root user for all stages
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

WORKDIR /app

# Install pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# ─── Stage 2: Dependencies ────────────────────────────────────────────────────
FROM base AS deps

# Copy workspace manifests first (better layer caching)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY turbo.json tsconfig.base.json ./

# Copy package manifests
COPY packages/types/package.json ./packages/types/
COPY packages/validators/package.json ./packages/validators/
COPY packages/logger/package.json ./packages/logger/
COPY packages/db/package.json ./packages/db/
COPY apps/streamline/package.json ./apps/streamline/

# Install ALL deps (needed for build)
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ─── Stage 3: Builder ─────────────────────────────────────────────────────────
FROM deps AS builder

# Copy source
COPY packages/ ./packages/
COPY apps/streamline/src/ ./apps/streamline/src/
COPY apps/streamline/tsconfig.json ./apps/streamline/
COPY apps/streamline/tsconfig.build.json ./apps/streamline/

# Build packages first (dependency order matters)
RUN pnpm --filter @probivio/types exec tsc -p tsconfig.json 2>/dev/null || true
RUN pnpm --filter @probivio/validators exec tsc -p tsconfig.json 2>/dev/null || true
RUN pnpm --filter @probivio/logger exec tsc -p tsconfig.json 2>/dev/null || true
RUN pnpm --filter @probivio/db exec tsc -p tsconfig.json 2>/dev/null || true

# Build the API
RUN pnpm --filter @probivio/streamline run build

# ─── Stage 4: Production ──────────────────────────────────────────────────────
FROM base AS production

ENV NODE_ENV=production
ENV PORT=8080

WORKDIR /app

# Copy workspace manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/types/package.json ./packages/types/
COPY packages/validators/package.json ./packages/validators/
COPY packages/logger/package.json ./packages/logger/
COPY packages/db/package.json ./packages/db/
COPY apps/streamline/package.json ./apps/streamline/

# Install ONLY production deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod

# Copy compiled output from builder
COPY --from=builder /app/apps/streamline/dist ./apps/streamline/dist
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/validators/dist ./packages/validators/dist
COPY --from=builder /app/packages/logger/dist ./packages/logger/dist
COPY --from=builder /app/packages/db/dist ./packages/db/dist

# Drop privileges
USER nodejs

EXPOSE 8080

# dumb-init handles signal forwarding (critical for graceful shutdown on Cloud Run)
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/streamline/dist/index.js"]

# Cloud Run health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# ─── Stage 5: Development ─────────────────────────────────────────────────────
FROM deps AS dev

ENV NODE_ENV=development

COPY packages/ ./packages/
COPY apps/streamline/ ./apps/streamline/

USER nodejs

EXPOSE 8080

CMD ["pnpm", "--filter", "@probivio/streamline", "run", "dev"]
