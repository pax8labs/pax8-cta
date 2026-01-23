# Base stage for shared dependencies
FROM node:20-alpine AS base

# Install security updates
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init && \
    rm -rf /var/cache/apk/*

RUN corepack enable pnpm
WORKDIR /app

# Dependencies stage
FROM base AS deps
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY packages/core/package.json ./packages/core/
COPY packages/worker/package.json ./packages/worker/
COPY packages/cli/package.json ./packages/cli/
COPY packages/web/package.json ./packages/web/
RUN pnpm install --frozen-lockfile --prod=false

# Build stage
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=deps /app/packages/worker/node_modules ./packages/worker/node_modules
COPY --from=deps /app/packages/cli/node_modules ./packages/cli/node_modules
COPY --from=deps /app/packages/web/node_modules ./packages/web/node_modules
COPY . .

# Set build-time environment variables
ARG APP_VERSION=0.1.0
ENV APP_VERSION=${APP_VERSION}
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm build

# Production dependencies
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY packages/core/package.json ./packages/core/
COPY packages/worker/package.json ./packages/worker/
COPY packages/cli/package.json ./packages/cli/
COPY packages/web/package.json ./packages/web/
RUN pnpm install --frozen-lockfile --prod

# Worker production image
FROM base AS worker
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 worker

COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/packages/worker/dist ./packages/worker/dist
COPY --from=builder /app/packages/worker/package.json ./packages/worker/
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=prod-deps /app/packages/worker/node_modules ./packages/worker/node_modules

# Create directories for snapshots and solutions
RUN mkdir -p /app/snapshots /app/solutions && \
    chown -R worker:nodejs /app

USER worker
WORKDIR /app/packages/worker

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "process.exit(0)"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]

# Web production image
FROM base AS web
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/packages/worker/dist ./packages/worker/dist
COPY --from=builder /app/packages/worker/package.json ./packages/worker/

# Copy Next.js standalone build
COPY --from=builder --chown=nextjs:nodejs /app/packages/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/packages/web/.next/static ./packages/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/packages/web/public ./packages/web/public

# Copy node_modules for dependencies
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=prod-deps /app/packages/worker/node_modules ./packages/worker/node_modules
COPY --from=prod-deps /app/packages/web/node_modules ./packages/web/node_modules

USER nextjs
WORKDIR /app/packages/web

EXPOSE 3001
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]

# CLI production image
FROM base AS cli
ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 cli

COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/packages/cli/dist ./packages/cli/dist
COPY --from=builder /app/packages/cli/package.json ./packages/cli/
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=prod-deps /app/packages/cli/node_modules ./packages/cli/node_modules

# Create directories for config and solutions
RUN mkdir -p /app/config /app/solutions && \
    chown -R cli:nodejs /app

USER cli
WORKDIR /app

ENTRYPOINT ["dumb-init", "--", "node", "/app/packages/cli/dist/index.js"]
