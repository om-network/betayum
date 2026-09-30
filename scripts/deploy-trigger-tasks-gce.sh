#!/usr/bin/env bash

set -euo pipefail

: "${PROJECT_ID:?PROJECT_ID is required}"
: "${TRIGGER_ZONE:?TRIGGER_ZONE is required}"
: "${TRIGGER_VM:?TRIGGER_VM is required}"
: "${TRIGGER_DEPLOYER_IMAGE:?TRIGGER_DEPLOYER_IMAGE is required}"
: "${COMMIT_SHA:?COMMIT_SHA is required}"

if [[ ! "${COMMIT_SHA}" =~ ^[a-f0-9]{7,40}$ ]]; then
  printf 'Invalid COMMIT_SHA.\n' >&2
  exit 64
fi

ARCHIVE="/workspace/betayum-trigger-${COMMIT_SHA}.tar.gz"
REMOTE_ARCHIVE="/tmp/betayum-trigger-${COMMIT_SHA}.tar.gz"
REMOTE_DEPLOY_SCRIPT="/usr/local/bin/deploy-betayum-trigger"
METADATA_DEPLOY_SCRIPT_URL="http://metadata.google.internal/computeMetadata/v1/instance/attributes/trigger-deploy-script"
trap 'rm -f -- "${ARCHIVE}"' EXIT

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

gcloud compute ssh "${TRIGGER_VM}" \
  --project="${PROJECT_ID}" \
  --zone="${TRIGGER_ZONE}" \
  --tunnel-through-iap \
  --quiet \
  --command="curl --fail --silent --show-error -H 'Metadata-Flavor: Google' '${METADATA_DEPLOY_SCRIPT_URL}' | base64 --decode | sudo tee '${REMOTE_DEPLOY_SCRIPT}' >/dev/null && sudo chmod 0755 '${REMOTE_DEPLOY_SCRIPT}' && sudo '${REMOTE_DEPLOY_SCRIPT}' '${REMOTE_ARCHIVE}' '${COMMIT_SHA}' '${TRIGGER_DEPLOYER_IMAGE}'"
