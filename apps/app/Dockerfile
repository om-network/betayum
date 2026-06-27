FROM oven/bun:1.3.4 AS builder

WORKDIR /app

COPY . .

RUN PRISMA_SKIP_POSTINSTALL_GENERATE=true bun install --ignore-scripts

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_ENV
ARG NEXT_PUBLIC_BETTER_AUTH_URL
ARG NEXT_PUBLIC_IS_DUB_ENABLED
ARG NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER
ARG NEXT_PUBLIC_PORTAL_URL
ARG NEXT_PUBLIC_POSTHOG_HOST
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_SELF_HOSTED

ENV CI=1 \
    NODE_ENV=production \
    NEXT_OUTPUT_STANDALONE=true \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS=--max_old_space_size=6144 \
    SKIP_ENV_VALIDATION=true \
    NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_APP_ENV=${NEXT_PUBLIC_APP_ENV} \
    NEXT_PUBLIC_BETTER_AUTH_URL=${NEXT_PUBLIC_BETTER_AUTH_URL} \
    NEXT_PUBLIC_IS_DUB_ENABLED=${NEXT_PUBLIC_IS_DUB_ENABLED} \
    NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER=${NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER} \
    NEXT_PUBLIC_PORTAL_URL=${NEXT_PUBLIC_PORTAL_URL} \
    NEXT_PUBLIC_POSTHOG_HOST=${NEXT_PUBLIC_POSTHOG_HOST} \
    NEXT_PUBLIC_POSTHOG_KEY=${NEXT_PUBLIC_POSTHOG_KEY} \
    NEXT_PUBLIC_SELF_HOSTED=${NEXT_PUBLIC_SELF_HOSTED}

RUN cd packages/db && node scripts/combine-schemas.js && node scripts/generate-prisma-client-js.js

RUN cd apps/app && bun run build:docker

FROM node:22-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fontconfig \
    fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    PORT=8080

COPY --from=builder --chown=node:node /app/apps/app/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/app/.next/static ./apps/app/.next/static
COPY --from=builder --chown=node:node /app/apps/app/public ./apps/app/public

USER node

EXPOSE 8080

CMD ["node", "apps/app/server.js"]
