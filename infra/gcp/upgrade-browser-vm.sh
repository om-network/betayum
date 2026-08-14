#!/usr/bin/env bash

set -euo pipefail

PROJECT_ID="${BETAYUM_GCP_PROJECT:?Set BETAYUM_GCP_PROJECT to the target GCP project ID}"
ZONE="${BETAYUM_GCP_ZONE:-us-central1-a}"
INSTANCE_NAME="${BETAYUM_BROWSER_VM_NAME:-${1:-}}"
SSH_MODE="${BETAYUM_BROWSER_VM_TUNNEL_MODE:-iap}"
SSH_KEY_FILE="${BETAYUM_BROWSER_VM_SSH_KEY_FILE:-${HOME}/.ssh/betayum_browser_local}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -z "${INSTANCE_NAME}" ]]; then
  printf 'Set BETAYUM_BROWSER_VM_NAME or pass the instance name as argument 1.\n' >&2
  exit 1
fi
if [[ "${SSH_MODE}" != "iap" && "${SSH_MODE}" != "external" ]]; then
  printf 'BETAYUM_BROWSER_VM_TUNNEL_MODE must be iap or external.\n' >&2
  exit 1
fi

gcloud compute instances add-metadata "${INSTANCE_NAME}" \
  --project="${PROJECT_ID}" \
  --zone="${ZONE}" \
  --metadata="enable-oslogin=FALSE,block-project-ssh-keys=TRUE" \
  --metadata-from-file="startup-script=${SCRIPT_DIR}/browser-vm-startup.sh" \
  --quiet
gcloud compute instances remove-metadata "${INSTANCE_NAME}" \
  --project="${PROJECT_ID}" \
  --zone="${ZONE}" \
  --keys=betayum-agent-token,betayum-browser-agent \
  --quiet || true

SSH_ARGS=()
if [[ "${SSH_MODE}" == "iap" ]]; then
  SSH_ARGS+=(--tunnel-through-iap)
else
  SSH_ARGS+=(--ssh-key-file="${SSH_KEY_FILE}")
fi

gcloud compute ssh "${INSTANCE_NAME}" \
  --project="${PROJECT_ID}" \
  --zone="${ZONE}" \
  "${SSH_ARGS[@]}" \
  --command='sudo google_metadata_script_runner startup'

gcloud compute ssh "${INSTANCE_NAME}" \
  --project="${PROJECT_ID}" \
  --zone="${ZONE}" \
  "${SSH_ARGS[@]}" \
  --command='sudo cat /var/lib/betayum-browser/bootstrap-version'
