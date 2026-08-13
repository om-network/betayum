#!/usr/bin/env bash
set -euo pipefail
PROJECT_ID="${BETAYUM_GCP_PROJECT:?Set BETAYUM_GCP_PROJECT to the target GCP project ID}"
ENVIRONMENT="${BETAYUM_ENVIRONMENT:-staging}"
REGION="${BETAYUM_GCP_REGION:-us-central1}"
ZONE="${BETAYUM_GCP_ZONE:-${REGION}-a}"
NETWORK="${BETAYUM_BROWSER_VM_NETWORK:-betayum-${ENVIRONMENT}-browser}"
SUBNET="${BETAYUM_BROWSER_VM_SUBNET:-${NETWORK}}"
SUBNET_RANGE="${BETAYUM_BROWSER_VM_SUBNET_RANGE:-10.80.0.0/24}"
ROUTER="${BETAYUM_BROWSER_VM_ROUTER:-${NETWORK}}"
NAT="${BETAYUM_BROWSER_VM_NAT:-${NETWORK}}"
API_SERVICE="${BETAYUM_API_SERVICE:-betayum-${ENVIRONMENT}-api}"
ROLE_ID="${BETAYUM_BROWSER_VM_ROLE_ID:-betayumBrowserVmManager}"
CONFIGURE_CLOUD_RUN="${BETAYUM_CONFIGURE_CLOUD_RUN:-false}"
CONFIGURE_IAM="${BETAYUM_CONFIGURE_IAM:-true}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STARTUP_SCRIPT="${SCRIPT_DIR}/browser-vm-startup.sh"
MACHINE_TYPE="e2-medium"
IMAGE_FAMILY="ubuntu-2404-lts-amd64"
IMAGE_PROJECT="ubuntu-os-cloud"

VIEWER_FIREWALL="betayum-${ENVIRONMENT}-browser-viewer"
IAP_FIREWALL="betayum-${ENVIRONMENT}-browser-iap-ssh"
TEMPLATE_HASH="$(
  {
    sha256sum "${STARTUP_SCRIPT}"
    printf '%s\n' "${MACHINE_TYPE}|${IMAGE_FAMILY}|${NETWORK}|${SUBNET}"
  } | sha256sum | cut -c1-12
)"
TEMPLATE="betayum-${ENVIRONMENT}-browser-${TEMPLATE_HASH}"
log() {
  printf '[browser-foundation] %s\n' "$*"
}
require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Required command is not installed: %s\n' "$1" >&2
    exit 1
  fi
}
require_value() {
  local label="$1"
  local expected="$2"
  local actual="$3"

  if [[ "${actual}" != "${expected}" ]]; then
    printf '%s mismatch: expected %s, found %s\n' \
      "${label}" "${expected}" "${actual}" >&2
    exit 1
  fi
}
require_command gcloud
require_command sha256sum

log "Enabling required APIs in ${PROJECT_ID}"
gcloud services enable \
  compute.googleapis.com \
  iam.googleapis.com \
  run.googleapis.com \
  --project="${PROJECT_ID}" \
  --quiet

if gcloud compute networks describe "${NETWORK}" \
  --project="${PROJECT_ID}" >/dev/null 2>&1; then
  NETWORK_MODE="$(
    gcloud compute networks describe "${NETWORK}" \
      --project="${PROJECT_ID}" \
      --format='value(autoCreateSubnetworks)'
  )"
  require_value "Network auto-subnet mode" "False" "${NETWORK_MODE}"
  log "Network ${NETWORK} already exists"
else
  log "Creating network ${NETWORK}"
  gcloud compute networks create "${NETWORK}" \
    --project="${PROJECT_ID}" \
    --subnet-mode=custom \
    --quiet
fi

if gcloud compute networks subnets describe "${SUBNET}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" >/dev/null 2>&1; then
  EXISTING_RANGE="$(
    gcloud compute networks subnets describe "${SUBNET}" \
      --project="${PROJECT_ID}" \
      --region="${REGION}" \
      --format='value(ipCidrRange)'
  )"
  EXISTING_NETWORK="$(
    gcloud compute networks subnets describe "${SUBNET}" \
      --project="${PROJECT_ID}" \
      --region="${REGION}" \
      --format='value(network.basename())'
  )"
  require_value "Subnet range" "${SUBNET_RANGE}" "${EXISTING_RANGE}"
  require_value "Subnet network" "${NETWORK}" "${EXISTING_NETWORK}"
  gcloud compute networks subnets update "${SUBNET}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --enable-private-ip-google-access \
    --quiet
  log "Subnet ${SUBNET} already exists"
else
  log "Creating subnet ${SUBNET}"
  gcloud compute networks subnets create "${SUBNET}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --network="${NETWORK}" \
    --range="${SUBNET_RANGE}" \
    --enable-private-ip-google-access \
    --quiet
fi

if gcloud compute routers describe "${ROUTER}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" >/dev/null 2>&1; then
  ROUTER_NETWORK="$(
    gcloud compute routers describe "${ROUTER}" \
      --project="${PROJECT_ID}" \
      --region="${REGION}" \
      --format='value(network.basename())'
  )"
  require_value "Router network" "${NETWORK}" "${ROUTER_NETWORK}"
  log "Router ${ROUTER} already exists"
else
  log "Creating router ${ROUTER}"
  gcloud compute routers create "${ROUTER}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --network="${NETWORK}" \
    --quiet
fi

if gcloud compute routers nats describe "${NAT}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --router="${ROUTER}" >/dev/null 2>&1; then
  gcloud compute routers nats update "${NAT}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --router="${ROUTER}" \
    --auto-allocate-nat-external-ips \
    --nat-custom-subnet-ip-ranges="${SUBNET}:ALL" \
    --quiet
  log "Cloud NAT ${NAT} already exists"
else
  log "Creating Cloud NAT ${NAT}"
  gcloud compute routers nats create "${NAT}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --router="${ROUTER}" \
    --auto-allocate-nat-external-ips \
    --nat-custom-subnet-ip-ranges="${SUBNET}:ALL" \
    --quiet
fi

if gcloud compute firewall-rules describe "${VIEWER_FIREWALL}" \
  --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud compute firewall-rules update "${VIEWER_FIREWALL}" \
    --project="${PROJECT_ID}" \
    --rules=tcp:22,tcp:6080 \
    --source-tags=betayum-api \
    --target-tags=betayum-browser-vm \
    --quiet
else
  gcloud compute firewall-rules create "${VIEWER_FIREWALL}" \
    --project="${PROJECT_ID}" \
    --network="${NETWORK}" \
    --direction=INGRESS \
    --action=ALLOW \
    --rules=tcp:22,tcp:6080 \
    --source-tags=betayum-api \
    --target-tags=betayum-browser-vm \
    --quiet
fi
log "Viewer firewall ${VIEWER_FIREWALL} is configured"

if gcloud compute firewall-rules describe "${IAP_FIREWALL}" \
  --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud compute firewall-rules update "${IAP_FIREWALL}" \
    --project="${PROJECT_ID}" \
    --rules=tcp:22 \
    --source-ranges=35.235.240.0/20 \
    --target-tags=betayum-browser-vm \
    --quiet
else
  gcloud compute firewall-rules create "${IAP_FIREWALL}" \
    --project="${PROJECT_ID}" \
    --network="${NETWORK}" \
    --direction=INGRESS \
    --action=ALLOW \
    --rules=tcp:22 \
    --source-ranges=35.235.240.0/20 \
    --target-tags=betayum-browser-vm \
    --quiet
fi
log "IAP SSH firewall ${IAP_FIREWALL} is configured"

if gcloud compute instance-templates describe "${TEMPLATE}" \
  --project="${PROJECT_ID}" >/dev/null 2>&1; then
  log "Instance template ${TEMPLATE} already exists"
else
  log "Creating instance template ${TEMPLATE}"
  gcloud compute instance-templates create "${TEMPLATE}" \
    --project="${PROJECT_ID}" \
    --machine-type="${MACHINE_TYPE}" \
    --image-family="${IMAGE_FAMILY}" \
    --image-project="${IMAGE_PROJECT}" \
    --boot-disk-size=20GB \
    --boot-disk-type=pd-balanced \
    --network="projects/${PROJECT_ID}/global/networks/${NETWORK}" \
    --subnet="projects/${PROJECT_ID}/regions/${REGION}/subnetworks/${SUBNET}" \
    --no-address \
    --tags=betayum-browser-vm \
    --labels=component=browser-automation,purpose=organization-browser \
    --metadata=enable-oslogin=FALSE,block-project-ssh-keys=TRUE \
    --metadata-from-file="startup-script=${STARTUP_SCRIPT}" \
    --no-service-account \
    --no-scopes \
    --shielded-secure-boot \
    --shielded-vtpm \
    --shielded-integrity-monitoring \
    --quiet
fi

if [[ "${CONFIGURE_IAM}" == "true" ]]; then
  API_SERVICE_ACCOUNT="${BETAYUM_API_SERVICE_ACCOUNT:-$(
    gcloud run services describe "${API_SERVICE}" \
      --project="${PROJECT_ID}" \
      --region="${REGION}" \
      --format='value(spec.template.spec.serviceAccountName)'
  )}"
  if [[ -z "${API_SERVICE_ACCOUNT}" ]]; then
    printf 'Could not resolve the runtime service account for %s\n' \
      "${API_SERVICE}" >&2
    exit 1
  fi
  ROLE_PERMISSIONS="$(
    printf '%s\n' \
      compute.disks.create \
      compute.disks.delete \
      compute.disks.use \
      compute.instanceTemplates.useReadOnly \
      compute.instances.create \
      compute.instances.delete \
      compute.instances.get \
      compute.instances.setMetadata \
      compute.instances.start \
      compute.instances.stop \
      compute.projects.get \
      compute.subnetworks.use \
      compute.zoneOperations.get |
      paste -sd, -
  )"

  if gcloud iam roles describe "${ROLE_ID}" \
    --project="${PROJECT_ID}" >/dev/null 2>&1; then
    gcloud iam roles update "${ROLE_ID}" \
      --project="${PROJECT_ID}" \
      --title='Betayum Browser VM Manager' \
      --description='Manage organization browser VMs from the Betayum API.' \
      --permissions="${ROLE_PERMISSIONS}" \
      --stage=GA \
      --quiet
  else
    gcloud iam roles create "${ROLE_ID}" \
      --project="${PROJECT_ID}" \
      --title='Betayum Browser VM Manager' \
      --description='Manage organization browser VMs from the Betayum API.' \
      --permissions="${ROLE_PERMISSIONS}" \
      --stage=GA \
      --quiet
  fi

  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${API_SERVICE_ACCOUNT}" \
    --role="projects/${PROJECT_ID}/roles/${ROLE_ID}" \
    --quiet >/dev/null
  log "API service account can manage organization browser VMs"
fi

TEMPLATE_LINK="projects/${PROJECT_ID}/global/instanceTemplates/${TEMPLATE}"
if [[ "${CONFIGURE_CLOUD_RUN}" == "true" ]]; then
  log "Connecting ${API_SERVICE} to the browser network"
  gcloud run services update "${API_SERVICE}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --network="${NETWORK}" \
    --subnet="${SUBNET}" \
    --network-tags=betayum-api \
    --vpc-egress=private-ranges-only \
    --timeout=1800 \
    --update-env-vars="BROWSER_VM_GCP_PROJECT=${PROJECT_ID},BROWSER_VM_GCP_ZONE=${ZONE},BROWSER_VM_INSTANCE_TEMPLATE=${TEMPLATE_LINK}" \
    --quiet
fi

printf '\nBrowser VM foundation is ready.\n'
printf 'Project:  %s\n' "${PROJECT_ID}"
printf 'Region:   %s\n' "${REGION}"
printf 'Zone:     %s\n' "${ZONE}"
printf 'Network:  %s\n' "${NETWORK}"
printf 'Template: %s\n' "${TEMPLATE_LINK}"
