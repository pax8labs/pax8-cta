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
COPY packages/cli/package.json ./packages/cli/
RUN pnpm install --frozen-lockfile --prod=false

# Build stage
FROM deps AS builder
COPY . .
RUN pnpm --filter @agentsync/core build && \
    pnpm --filter @agentsync/cli build

# Production dependencies
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY packages/core/package.json ./packages/core/
COPY packages/cli/package.json ./packages/cli/
RUN pnpm install --frozen-lockfile --prod

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
