#!/usr/bin/env bash

set -euo pipefail

PROJECT_ID="${BETAYUM_GCP_PROJECT:?Set BETAYUM_GCP_PROJECT to the target GCP project ID}"
ZONE="${BETAYUM_GCP_ZONE:-us-central1-a}"
INSTANCE_NAME="${BETAYUM_BROWSER_VM_NAME:-betayum-foxclocks-poc}"
NETWORK="${BETAYUM_BROWSER_VM_NETWORK:-default}"
SUBNET="${BETAYUM_BROWSER_VM_SUBNET:-default}"
PRIVATE_VM="${BETAYUM_BROWSER_VM_PRIVATE:-false}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STARTUP_SCRIPT="${SCRIPT_DIR}/browser-vm-startup.sh"

if gcloud compute instances describe "${INSTANCE_NAME}" \
  --project="${PROJECT_ID}" \
  --zone="${ZONE}" >/dev/null 2>&1; then
  echo "VM ${INSTANCE_NAME} already exists in ${PROJECT_ID}/${ZONE}."
  exit 0
fi

NETWORK_ARGS=(
  "--network=${NETWORK}"
  "--subnet=${SUBNET}"
)
if [[ "${PRIVATE_VM}" == "true" ]]; then
  NETWORK_ARGS+=("--no-address")
fi

gcloud compute instances create "${INSTANCE_NAME}" \
  --project="${PROJECT_ID}" \
  --zone="${ZONE}" \
  --machine-type="e2-medium" \
  --image-family="ubuntu-2404-lts-amd64" \
  --image-project="ubuntu-os-cloud" \
  --boot-disk-size="20GB" \
  --boot-disk-type="pd-balanced" \
  "${NETWORK_ARGS[@]}" \
  --tags="betayum-browser-vm" \
  --labels="component=browser-automation,purpose=foxclocks-poc" \
  --metadata="enable-oslogin=FALSE,block-project-ssh-keys=TRUE" \
  --metadata-from-file="startup-script=${STARTUP_SCRIPT}" \
  --no-service-account \
  --no-scopes \
  --shielded-secure-boot \
  --shielded-vtpm \
  --shielded-integrity-monitoring

echo "VM ${INSTANCE_NAME} created. Bootstrap progress is available in serial-port output."
