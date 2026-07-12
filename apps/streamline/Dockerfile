# =============================================================================
# Streamline Probate Engine — Multi-stage Docker build
# Target: Google Cloud Run
#
# Base image: Debian slim, NOT Alpine. onnxruntime-node's native binary
# (used for per-operator ML lead scoring) is dynamically linked against
# glibc and requires /lib64/ld-linux-x86-64.so.2, which does not exist on
# musl-libc-based Alpine — the container fails at startup with
# "Error loading shared library ld-linux-x86-64.so.2" if built on Alpine.
# Debian slim is still a reasonably small, well-maintained base and avoids
# this whole class of native-binary incompatibility.
# =============================================================================

# ─── Stage 1: Base ────────────────────────────────────────────────────────────
FROM node:23.3.0-slim AS base

# Install security updates + runtime tools
RUN apt-get update && apt-get upgrade -y && \
    apt-get install -y --no-install-recommends \
      dumb-init \
      curl \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Non-root user for all stages
RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs -s /bin/bash -m nodejs

WORKDIR /app

# Install pnpm directly via npm rather than `corepack prepare` — corepack's
# signature verification against a stale bundled key intermittently rejects
# otherwise-legitimate pnpm releases after npm registry key rotations
# (see https://github.com/pnpm/pnpm/issues/9029), which breaks this build
# non-deterministically. Installing the exact pinned version via npm sidesteps
# that verification entirely and is just as reproducible.
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm@9.15.9

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
