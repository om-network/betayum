#!/usr/bin/env bash

set -euo pipefail

PROJECT_ID="${BETAYUM_GCP_PROJECT:?Set BETAYUM_GCP_PROJECT to the target GCP project ID}"
ZONE="${BETAYUM_GCP_ZONE:-us-central1-a}"
INSTANCE_NAME="${BETAYUM_BROWSER_VM_NAME:-${1:-}}"
LOCAL_PORT="${BETAYUM_BROWSER_VM_LOCAL_PORT:-16080}"
TUNNEL_MODE="${BETAYUM_BROWSER_VM_TUNNEL_MODE:-iap}"
SSH_KEY_FILE="${BETAYUM_BROWSER_VM_SSH_KEY_FILE:-${HOME}/.ssh/betayum_browser_local}"
LOCAL_TAG="${INSTANCE_NAME}-local-ssh"
LOCAL_FIREWALL="${INSTANCE_NAME}-local-ssh"
CREATED_ACCESS_CONFIG=false

if [[ -z "${INSTANCE_NAME}" ]]; then
  printf 'Set BETAYUM_BROWSER_VM_NAME or pass the instance name as argument 1.\n' >&2
  exit 1
fi

if [[ ! "${LOCAL_PORT}" =~ ^[0-9]+$ ]] ||
  ((LOCAL_PORT < 1024 || LOCAL_PORT > 65535)); then
  printf 'BETAYUM_BROWSER_VM_LOCAL_PORT must be between 1024 and 65535.\n' >&2
  exit 1
fi

if [[ "${TUNNEL_MODE}" != "iap" && "${TUNNEL_MODE}" != "external" ]]; then
  printf 'BETAYUM_BROWSER_VM_TUNNEL_MODE must be iap or external.\n' >&2
  exit 1
fi

STATUS="$(
  gcloud compute instances describe "${INSTANCE_NAME}" \
    --project="${PROJECT_ID}" \
    --zone="${ZONE}" \
    --format='value(status)'
)"
if [[ "${STATUS}" == "TERMINATED" ]]; then
  gcloud compute instances start "${INSTANCE_NAME}" \
    --project="${PROJECT_ID}" \
    --zone="${ZONE}" \
    --quiet
elif [[ "${STATUS}" != "RUNNING" ]]; then
  printf 'Instance %s is not ready for tunneling: %s\n' \
    "${INSTANCE_NAME}" "${STATUS}" >&2
  exit 1
fi

INTERNAL_IP="$(
  gcloud compute instances describe "${INSTANCE_NAME}" \
    --project="${PROJECT_ID}" \
    --zone="${ZONE}" \
    --format='value(networkInterfaces[0].networkIP)'
)"
if [[ -z "${INTERNAL_IP}" ]]; then
  printf 'Instance %s does not have an internal IP.\n' "${INSTANCE_NAME}" >&2
  exit 1
fi

cleanup_external_access() {
  if [[ "${TUNNEL_MODE}" != "external" ]]; then
    return
  fi

  gcloud compute firewall-rules delete "${LOCAL_FIREWALL}" \
    --project="${PROJECT_ID}" --quiet >/dev/null 2>&1 || true
  gcloud compute instances remove-tags "${INSTANCE_NAME}" \
    --project="${PROJECT_ID}" \
    --zone="${ZONE}" \
    --tags="${LOCAL_TAG}" \
    --quiet >/dev/null 2>&1 || true
  gcloud compute instances add-metadata "${INSTANCE_NAME}" \
    --project="${PROJECT_ID}" \
    --zone="${ZONE}" \
    --metadata=enable-oslogin=TRUE \
    --quiet >/dev/null 2>&1 || true
  if [[ "${CREATED_ACCESS_CONFIG}" == "true" ]]; then
    gcloud compute instances delete-access-config "${INSTANCE_NAME}" \
      --project="${PROJECT_ID}" \
      --zone="${ZONE}" \
      --access-config-name=external-nat \
      --quiet >/dev/null 2>&1 || true
  fi
}

SSH_ARGS=()
if [[ "${TUNNEL_MODE}" == "iap" ]]; then
  SSH_ARGS+=(--tunnel-through-iap)
else
  if [[ ! -f "${SSH_KEY_FILE}" ]]; then
    ssh-keygen -q -t ed25519 -N '' \
      -C 'betayum-browser-local' \
      -f "${SSH_KEY_FILE}"
  fi
  SSH_ARGS+=(--ssh-key-file="${SSH_KEY_FILE}")
  CLIENT_IP="${BETAYUM_BROWSER_VM_CLIENT_IP:-$(
    curl --fail --silent --show-error https://checkip.amazonaws.com
  )}"
  if [[ ! "${CLIENT_IP}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    printf 'Could not determine a valid public IPv4 address.\n' >&2
    exit 1
  fi

  trap cleanup_external_access EXIT INT TERM
  gcloud compute instances add-metadata "${INSTANCE_NAME}" \
    --project="${PROJECT_ID}" \
    --zone="${ZONE}" \
    --metadata=enable-oslogin=FALSE \
    --quiet
  gcloud compute instances add-tags "${INSTANCE_NAME}" \
    --project="${PROJECT_ID}" \
    --zone="${ZONE}" \
    --tags="${LOCAL_TAG}" \
    --quiet

  NETWORK="$(
    gcloud compute instances describe "${INSTANCE_NAME}" \
      --project="${PROJECT_ID}" \
      --zone="${ZONE}" \
      --format='value(networkInterfaces[0].network.basename())'
  )"
  if gcloud compute firewall-rules describe "${LOCAL_FIREWALL}" \
    --project="${PROJECT_ID}" >/dev/null 2>&1; then
    gcloud compute firewall-rules update "${LOCAL_FIREWALL}" \
      --project="${PROJECT_ID}" \
      --rules=tcp:22 \
      --source-ranges="${CLIENT_IP}/32" \
      --target-tags="${LOCAL_TAG}" \
      --quiet
  else
    gcloud compute firewall-rules create "${LOCAL_FIREWALL}" \
      --project="${PROJECT_ID}" \
      --network="${NETWORK}" \
      --direction=INGRESS \
      --action=ALLOW \
      --rules=tcp:22 \
      --source-ranges="${CLIENT_IP}/32" \
      --target-tags="${LOCAL_TAG}" \
      --quiet
  fi

  EXTERNAL_IP="$(
    gcloud compute instances describe "${INSTANCE_NAME}" \
      --project="${PROJECT_ID}" \
      --zone="${ZONE}" \
      --format='value(networkInterfaces[0].accessConfigs[0].natIP)'
  )"
  if [[ -z "${EXTERNAL_IP}" ]]; then
    gcloud compute instances add-access-config "${INSTANCE_NAME}" \
      --project="${PROJECT_ID}" \
      --zone="${ZONE}" \
      --access-config-name=external-nat \
      --quiet
    CREATED_ACCESS_CONFIG=true
  fi
fi

printf 'Keep this process running while testing locally.\n'
printf 'Set BROWSER_VM_LOCAL_VIEWER_URL=http://127.0.0.1:%s on the local API.\n' \
  "${LOCAL_PORT}"
printf 'Direct noVNC URL: http://127.0.0.1:%s/vnc.html?autoconnect=true\n' \
  "${LOCAL_PORT}"

gcloud compute ssh "${INSTANCE_NAME}" \
  --project="${PROJECT_ID}" \
  --zone="${ZONE}" \
  "${SSH_ARGS[@]}" \
  -- -N -L "127.0.0.1:${LOCAL_PORT}:${INTERNAL_IP}:6080"
