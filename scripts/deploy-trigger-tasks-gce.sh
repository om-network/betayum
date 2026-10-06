#!/usr/bin/env bash

set -euo pipefail

: "${PROJECT_ID:?PROJECT_ID is required}"
: "${TRIGGER_ZONE:?TRIGGER_ZONE is required}"
: "${TRIGGER_VM:?TRIGGER_VM is required}"
: "${TRIGGER_DEPLOYER_IMAGE:?TRIGGER_DEPLOYER_IMAGE is required}"
: "${COMMIT_SHA:?COMMIT_SHA is required}"
: "${TRIGGER_ENVIRONMENT:?TRIGGER_ENVIRONMENT is required}"
: "${API_URL:?API_URL is required}"
: "${APP_URL:?APP_URL is required}"
: "${PORTAL_URL:?PORTAL_URL is required}"
: "${APP_DATA_BUCKET:?APP_DATA_BUCKET is required}"

if [[ ! "${COMMIT_SHA}" =~ ^[a-f0-9]{7,40}$ ]]; then
  printf 'Invalid COMMIT_SHA.\n' >&2
  exit 64
fi

ARCHIVE="/workspace/betayum-trigger-${COMMIT_SHA}.tar.gz"
REMOTE_ARCHIVE="/tmp/betayum-trigger-${COMMIT_SHA}.tar.gz"
REMOTE_DEPLOY_SOURCE="/tmp/betayum-trigger-deploy-${COMMIT_SHA}.sh"
trap 'rm -f -- "${ARCHIVE}"' EXIT

printf -v deploy_arguments ' %q' \
  "${REMOTE_ARCHIVE}" "${COMMIT_SHA}" "${TRIGGER_DEPLOYER_IMAGE}" \
  "${TRIGGER_ENVIRONMENT}" "${API_URL}" "${APP_URL}" \
  "${PORTAL_URL}" "${APP_DATA_BUCKET}"

if [[ ! -f "${ARCHIVE}" ]]; then
  printf 'Packaged Trigger.dev source is missing: %s\n' "${ARCHIVE}" >&2
  exit 66
fi

gcloud compute scp \
  "${ARCHIVE}" \
  "${TRIGGER_VM}:${REMOTE_ARCHIVE}" \
  --project="${PROJECT_ID}" \
  --zone="${TRIGGER_ZONE}" \
  --tunnel-through-iap \
  --quiet

gcloud compute scp \
  infra/gcp/trigger/deploy.sh \
  "${TRIGGER_VM}:${REMOTE_DEPLOY_SOURCE}" \
  --project="${PROJECT_ID}" \
  --zone="${TRIGGER_ZONE}" \
  --tunnel-through-iap \
  --quiet

gcloud compute ssh "${TRIGGER_VM}" \
  --project="${PROJECT_ID}" \
  --zone="${TRIGGER_ZONE}" \
  --tunnel-through-iap \
  --quiet \
  --command="sudo bash '${REMOTE_DEPLOY_SOURCE}'${deploy_arguments}"
