# =============================================================================
# STAGE 1: Dependencies - Install and cache workspace dependencies
# =============================================================================
FROM oven/bun:1.3.4 AS deps

WORKDIR /app

# Copy workspace configuration
COPY package.json bun.lock bunfig.toml ./

# Copy package.json files for workspace packages used by the app and portal
COPY packages/auth/package.json ./packages/auth/
COPY packages/billing/package.json ./packages/billing/
COPY packages/company/package.json ./packages/company/
COPY packages/db/package.json ./packages/db/
COPY packages/kv/package.json ./packages/kv/
COPY packages/ui/package.json ./packages/ui/
COPY packages/email/package.json ./packages/email/
COPY packages/integration-platform/package.json ./packages/integration-platform/
COPY packages/integrations/package.json ./packages/integrations/
COPY packages/utils/package.json ./packages/utils/
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/analytics/package.json ./packages/analytics/

# Copy app package.json files
COPY apps/app/package.json ./apps/app/
COPY apps/portal/package.json ./apps/portal/

# Install all dependencies
RUN PRISMA_SKIP_POSTINSTALL_GENERATE=true bun install --ignore-scripts

# =============================================================================
# STAGE 2: Migrator - Repository Schema and Migrations
# =============================================================================
FROM oven/bun:1.3.4 AS migrator

WORKDIR /app/packages/db

COPY packages/db/package.json ./package.json
COPY packages/db/prisma.config.ts ./prisma.config.ts
COPY packages/db/prisma ./prisma

RUN bun install --ignore-scripts

CMD ["bunx", "prisma", "migrate", "deploy"]

# =============================================================================
# STAGE 3: Seeder - Full DB package runtime
# =============================================================================
FROM deps AS seeder

WORKDIR /app

COPY packages/db ./packages/db
COPY packages/tsconfig ./packages/tsconfig

RUN cd packages/db && bun run db:generate

CMD ["bun", "run", "--cwd", "packages/db", "db:seed"]

# =============================================================================
# STAGE 4: App Builder
# =============================================================================
FROM deps AS app-builder

WORKDIR /app

# Copy all source code needed for build
COPY packages ./packages
COPY apps/app ./apps/app

# Bring in node_modules for build and prisma prebuild
COPY --from=deps /app/node_modules ./node_modules

# Build workspace packages that expose compiled dist files. The deps
# stage used --ignore-scripts, so packages/db's postinstall did not run.
RUN cd packages/db && bun run build \
    && cd ../auth && bun run build \
    && cd ../company && bun run build \
    && cd ../billing && bun run build
RUN cd apps/app && bun run db:getschema

# Ensure Next build has required public env at build-time
ARG NEXT_PUBLIC_BETTER_AUTH_URL
ARG NEXT_PUBLIC_PORTAL_URL
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
ARG NEXT_PUBLIC_IS_DUB_ENABLED
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_BETTER_AUTH_URL=$NEXT_PUBLIC_BETTER_AUTH_URL \
    NEXT_PUBLIC_PORTAL_URL=$NEXT_PUBLIC_PORTAL_URL \
    NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY \
    NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST \
    NEXT_PUBLIC_IS_DUB_ENABLED=$NEXT_PUBLIC_IS_DUB_ENABLED \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY \
    NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production \
    NEXT_SKIP_TYPECHECK=true \
    NEXT_OUTPUT_STANDALONE=true \
    NODE_OPTIONS=--max_old_space_size=6144

# Build the app
RUN cd apps/app && SKIP_ENV_VALIDATION=true bun run build:docker

# =============================================================================
# STAGE 5: App Production
# =============================================================================
FROM node:22-alpine AS app

WORKDIR /app

# Copy Next standalone output
COPY --from=app-builder /app/apps/app/.next/standalone ./
COPY --from=app-builder /app/apps/app/.next/static ./apps/app/.next/static
COPY --from=app-builder /app/apps/app/public ./apps/app/public

EXPOSE 3000
CMD ["node", "apps/app/server.js"]

# =============================================================================
# STAGE 6: Portal Builder
# =============================================================================
FROM deps AS portal-builder

WORKDIR /app

# Copy all source code needed for build
COPY packages ./packages
COPY apps/portal ./apps/portal

# Bring in node_modules for build and prisma prebuild
COPY --from=deps /app/node_modules ./node_modules

# Build workspace packages that expose compiled dist files. The deps
# stage used --ignore-scripts, so packages/db's postinstall did not run.
RUN cd packages/db && bun run build \
    && cd ../auth && bun run build \
    && cd ../company && bun run build
RUN cd apps/portal && bun run db:getschema

# Ensure Next build has required public env at build-time
ARG NEXT_PUBLIC_BETTER_AUTH_URL
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_BETTER_AUTH_URL=$NEXT_PUBLIC_BETTER_AUTH_URL \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production \
    NEXT_SKIP_TYPECHECK=true \
    NEXT_OUTPUT_STANDALONE=true \
    NODE_OPTIONS=--max_old_space_size=6144

# Build the portal
RUN cd apps/portal && SKIP_ENV_VALIDATION=true bun run build:docker

# =============================================================================
# STAGE 7: Portal Production
# =============================================================================
FROM node:22-alpine AS portal

WORKDIR /app

# Copy Next standalone output for portal
COPY --from=portal-builder /app/apps/portal/.next/standalone ./
COPY --from=portal-builder /app/apps/portal/.next/static ./apps/portal/.next/static
COPY --from=portal-builder /app/apps/portal/public ./apps/portal/public

EXPOSE 3000
CMD ["node", "apps/portal/server.js"]

# (Trigger.dev hosted; no local runner stage)
