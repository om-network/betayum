#!/usr/bin/env bash

set -euo pipefail

TRIGGER_ROOT=/var/lib/betayum-trigger
TRIGGER_SOURCE_ROOT="${TRIGGER_ROOT}/source"
TRIGGER_RUNTIME_ENV_FILE="${TRIGGER_ROOT}/task-runtime.env"
TRIGGER_BUILDKIT_CONFIG="${TRIGGER_ROOT}/buildkitd.toml"

if [[ "$#" -ne 8 ]]; then
  printf 'Usage: deploy-betayum-trigger ARCHIVE COMMIT_SHA DEPLOYER_IMAGE ENVIRONMENT API_URL APP_URL PORTAL_URL APP_DATA_BUCKET\n' >&2
  exit 64
fi

ARCHIVE="$1"
COMMIT_SHA="$2"
DEPLOYER_IMAGE="$3"
DEPLOY_ENVIRONMENT="$4"
API_URL="$5"
APP_URL="$6"
PORTAL_URL="$7"
APP_DATA_BUCKET="$8"

if [[ ! "${ARCHIVE}" =~ ^/tmp/betayum-trigger-[a-f0-9]{7,40}\.tar\.gz$ ]]; then
  printf 'Unexpected source archive path.\n' >&2
  exit 64
fi
if [[ ! "${COMMIT_SHA}" =~ ^[a-f0-9]{7,40}$ ]]; then
  printf 'Invalid commit SHA.\n' >&2
  exit 64
fi
if [[ ! "${DEPLOYER_IMAGE}" =~ ^[a-z0-9.-]+-docker\.pkg\.dev/[a-z0-9-]+/[a-z0-9-]+/trigger-deployer:[a-f0-9]{7,40}$ ]]; then
  printf 'Invalid Trigger.dev deployer image.\n' >&2
  exit 64
fi
if [[ "${DEPLOY_ENVIRONMENT}" != staging && "${DEPLOY_ENVIRONMENT}" != production ]]; then
  printf 'Invalid Trigger.dev deployment environment.\n' >&2
  exit 64
fi
for url in "${API_URL}" "${APP_URL}" "${PORTAL_URL}"; do
  if [[ ! "${url}" =~ ^https://[a-z0-9.-]+$ ]]; then
    printf 'Invalid deployment service URL.\n' >&2
    exit 64
  fi
done
if [[ ! "${APP_DATA_BUCKET}" =~ ^[a-z0-9._-]+$ ]]; then
  printf 'Invalid app data bucket.\n' >&2
  exit 64
fi

exec 9>"${TRIGGER_ROOT}/deploy.lock"
flock --exclusive 9
source /usr/local/lib/betayum-trigger-secret-env.sh
initialize_secret_context
REGISTRY_PASSWORD="$(read_environment_secret trigger-registry-password true)"
TRIGGER_ENVIRONMENT="${DEPLOY_ENVIRONMENT}"

for _attempt in $(seq 1 30); do
  curl --fail --silent http://127.0.0.1:8030/healthcheck >/dev/null && break
  sleep 5
done
curl --fail --silent --show-error http://127.0.0.1:8030/healthcheck >/dev/null

TRIGGER_CI_ACCESS_TOKEN="$(read_environment_secret trigger-access-token true)"
TRIGGER_PROJECT_ID="$(read_environment_secret trigger-project-id true)"
TRIGGER_INTERNAL_IP="$(metadata_value instance/network-interfaces/0/ip)"
TRIGGER_API_URL="$(metadata_value instance/attributes/trigger-origin)"
ARTIFACT_HOST="${DEPLOYER_IMAGE%%/*}"

install -m 0600 /dev/null "${TRIGGER_BUILDKIT_CONFIG}"
printf '[registry."%s:5000"]\n  http = true\n  insecure = true\n' \
  "${TRIGGER_INTERNAL_IP}" >"${TRIGGER_BUILDKIT_CONFIG}"

ARTIFACT_TOKEN="$(
  metadata_value instance/service-accounts/default/token | jq -er '.access_token'
)"
printf '%s' "${ARTIFACT_TOKEN}" \
  | docker login --username oauth2accesstoken --password-stdin "https://${ARTIFACT_HOST}"
printf '%s' "${REGISTRY_PASSWORD}" \
  | docker login --username registry-user --password-stdin "${TRIGGER_INTERNAL_IP}:5000"
docker pull "${DEPLOYER_IMAGE}"

install -d -m 0750 "${TRIGGER_SOURCE_ROOT}"
find "${TRIGGER_SOURCE_ROOT}" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
tar --extract --gzip --file "${ARCHIVE}" --directory "${TRIGGER_SOURCE_ROOT}"
rm -f -- "${ARCHIVE}"

install -m 0600 /dev/null "${TRIGGER_RUNTIME_ENV_FILE}"
printf '%s\n' \
  "API_BASE_URL=${API_URL}" \
  "BACKEND_API_URL=${API_URL}" \
  "BASE_URL=${API_URL}" \
  "BETTER_AUTH_URL=${API_URL}" \
  "NEXT_PUBLIC_API_URL=${API_URL}" \
  "NEXT_PUBLIC_APP_URL=${APP_URL}" \
  "NEXT_PUBLIC_BETTER_AUTH_URL=${API_URL}" \
  "NEXT_PUBLIC_PORTAL_URL=${PORTAL_URL}" \
  "CODEX_AUTOMATION_API_BASE_URL=${API_URL}" \
  "CODEX_AUTOMATION_LOCAL_DIRECT=false" \
  "APP_GCP_BUCKET_NAME=${APP_DATA_BUCKET}" \
  "APP_GCP_QUESTIONNAIRE_UPLOAD_BUCKET=${APP_DATA_BUCKET}" \
  "APP_GCP_KNOWLEDGE_BASE_BUCKET=${APP_DATA_BUCKET}" \
  "APP_GCP_ORG_ASSETS_BUCKET=${APP_DATA_BUCKET}" \
  "APP_GCP_ENDPOINT=https://storage.googleapis.com" \
  "APP_GCP_REGION=auto" >>"${TRIGGER_RUNTIME_ENV_FILE}"

append_docker_secret DATABASE_URL trigger-task-database-url true
append_docker_secret SERVICE_TOKEN_TRIGGER service-token-trigger true
append_docker_secret SECRET_KEY secret-key
append_docker_secret AUTH_SECRET auth-secret
append_docker_secret ENCRYPTION_KEY encryption-key
append_docker_secret RESEND_API_KEY resend-api-key
append_docker_secret OPENAI_API_KEY openai-api-key
append_docker_secret ANTHROPIC_API_KEY anthropic-api-key
append_docker_secret GROQ_API_KEY groq-api-key
append_docker_secret FIRECRAWL_API_KEY firecrawl-api-key
append_docker_secret NOVU_API_KEY novu-api-key
append_docker_secret REVALIDATION_SECRET revalidation-secret
append_docker_secret UPSTASH_REDIS_REST_URL upstash-redis-rest-url
append_docker_secret UPSTASH_REDIS_REST_TOKEN upstash-redis-rest-token
append_docker_secret APP_GCP_ACCESS_KEY_ID app-gcp-access-key-id
append_docker_secret APP_GCP_SECRET_ACCESS_KEY app-gcp-secret-access-key

export TRIGGER_ACCESS_TOKEN="${TRIGGER_CI_ACCESS_TOKEN}"
export TRIGGER_API_URL TRIGGER_PROJECT_ID
docker run --rm --network host \
  --env-file "${TRIGGER_RUNTIME_ENV_FILE}" \
  --env TRIGGER_ACCESS_TOKEN \
  --env TRIGGER_API_URL \
  --env TRIGGER_PROJECT_ID \
  --env TRIGGER_TELEMETRY_DISABLED=1 \
  --volume /root/.docker:/root/.docker \
  --volume /var/run/docker.sock:/var/run/docker.sock \
  --volume "${TRIGGER_BUILDKIT_CONFIG}:/etc/buildkit/buildkitd.toml:ro" \
  --volume "${TRIGGER_SOURCE_ROOT}:/workspace" \
  --workdir /workspace/apps/app \
  "${DEPLOYER_IMAGE}" \
  sh -euc '
    cd /workspace
    bun install --frozen-lockfile --ignore-scripts
    bun run --filter @trycompai/auth build
    bun run --filter @trycompai/utils build
    bun run --filter @trycompai/db build
    bun run --filter @trycompai/email build
    bun run --filter @trycompai/integration-platform build
    cd /workspace/packages/db
    node scripts/generate-prisma-client-js.js
    cd /workspace/apps/app
    node scripts/prepare-prisma-schema.js
    bunx prisma generate --schema=prisma/schema
    docker buildx inspect betayum-trigger >/dev/null 2>&1 ||
      docker buildx create --name betayum-trigger --driver docker-container \
        --driver-opt network=host --config /etc/buildkit/buildkitd.toml >/dev/null
    bunx trigger.dev@4.5.9 deploy --env prod --project-ref "$TRIGGER_PROJECT_ID" \
      --builder betayum-trigger
  '

printf 'Deployed %s Trigger.dev tasks for commit %s.\n' "${DEPLOY_ENVIRONMENT}" "${COMMIT_SHA}"
