FROM oven/bun:1.3.4 AS bun-bin

FROM node:22-slim AS deps

WORKDIR /app

COPY --from=bun-bin /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx

COPY package.json bun.lock ./

COPY packages/auth/package.json ./packages/auth/
COPY packages/billing/package.json ./packages/billing/
COPY packages/company/package.json ./packages/company/
COPY packages/db/package.json ./packages/db/
COPY packages/email/package.json ./packages/email/
COPY packages/integration-platform/package.json ./packages/integration-platform/
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/utils/package.json ./packages/utils/
COPY apps/api/package.json ./apps/api/

RUN PRISMA_SKIP_POSTINSTALL_GENERATE=true bun install --ignore-scripts

FROM node:22-slim AS builder

WORKDIR /app

ENV NODE_OPTIONS=--max_old_space_size=6144 \
    NODE_PATH=/app/node_modules

COPY --from=bun-bin /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/bun.lock ./bun.lock

COPY packages/auth ./packages/auth
COPY packages/billing ./packages/billing
COPY packages/company ./packages/company
COPY packages/db ./packages/db
COPY packages/email ./packages/email
COPY packages/integration-platform ./packages/integration-platform
COPY packages/tsconfig ./packages/tsconfig
COPY packages/utils ./packages/utils
COPY apps/api ./apps/api

RUN cd packages/db && bun run build

RUN cd apps/api && bun run build:docker

FROM node:22-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fontconfig \
    fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production \
    NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt \
    PORT=8080

COPY --from=builder --chown=node:node /app/apps/api/dist ./dist
COPY --from=builder --chown=node:node /app/apps/api/package.json ./package.json
COPY --from=builder --chown=node:node /app/apps/api/prisma ./prisma
COPY --from=builder --chown=node:node /app/packages ./packages
COPY --from=builder --chown=node:node /app/node_modules ./node_modules

USER node

EXPOSE 8080

CMD ["node", "dist/src/main.js"]
