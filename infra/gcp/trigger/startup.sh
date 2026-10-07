#!/usr/bin/env bash

set -euo pipefail

TRIGGER_ROOT=/var/lib/betayum-trigger
TRIGGER_ENV_FILE="${TRIGGER_ROOT}/.env"
COMPOSE_VERSION=v2.39.4

exec > >(tee -a /var/log/betayum-trigger-bootstrap.log | logger -t betayum-trigger-bootstrap -s 2>/dev/console) 2>&1
export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install --yes --no-install-recommends apache2-utils ca-certificates curl docker.io jq
install -d -m 0750 "${TRIGGER_ROOT}/clickhouse" "${TRIGGER_ROOT}/registry"
install -d -m 0755 "${TRIGGER_ROOT}/bin"

curl --fail --silent --show-error --location \
  "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-x86_64" \
  --output "${TRIGGER_ROOT}/bin/docker-compose"
chmod 0755 "${TRIGGER_ROOT}/bin/docker-compose"

decode_metadata_file() {
  local attribute="$1"
  local destination="$2"
  curl --fail --silent --show-error \
    -H 'Metadata-Flavor: Google' \
    "http://metadata.google.internal/computeMetadata/v1/instance/attributes/${attribute}" \
    | base64 --decode >"${destination}"
}

decode_metadata_file trigger-compose "${TRIGGER_ROOT}/compose.yaml"
decode_metadata_file trigger-clickhouse-data-paths "${TRIGGER_ROOT}/clickhouse/data-paths.xml"
decode_metadata_file trigger-clickhouse-override "${TRIGGER_ROOT}/clickhouse/override.xml"
decode_metadata_file trigger-clickhouse-users "${TRIGGER_ROOT}/clickhouse/users-override.xml"
decode_metadata_file trigger-secret-helper /usr/local/lib/betayum-trigger-secret-env.sh
decode_metadata_file trigger-deploy-script /usr/local/bin/deploy-betayum-trigger
chmod 0755 /usr/local/bin/deploy-betayum-trigger
chmod 0644 /usr/local/lib/betayum-trigger-secret-env.sh

source /usr/local/lib/betayum-trigger-secret-env.sh
initialize_secret_context
TRIGGER_INTERNAL_IP="$(metadata_value instance/network-interfaces/0/ip)"
TRIGGER_ORIGIN="$(metadata_value instance/attributes/trigger-origin)"

install -m 0600 /dev/null "${TRIGGER_ENV_FILE}"
printf "TRIGGER_ORIGIN='%s'\n" "${TRIGGER_ORIGIN}" >>"${TRIGGER_ENV_FILE}"
printf "DOCKER_REGISTRY_URL='%s:5000'\n" "${TRIGGER_INTERNAL_IP}" >>"${TRIGGER_ENV_FILE}"
printf "CLOUD_SQL_INSTANCE='%s'\n" "$(metadata_value instance/attributes/cloud-sql-instance)" >>"${TRIGGER_ENV_FILE}"
append_compose_secret POSTGRES_PASSWORD trigger-postgres-password true
append_compose_secret CLICKHOUSE_PASSWORD trigger-clickhouse-password true
append_compose_secret SESSION_SECRET trigger-session-secret true
append_compose_secret MAGIC_LINK_SECRET trigger-magic-link-secret true
append_compose_secret RESEND_API_KEY resend-api-key true
append_compose_secret TRIGGER_ENCRYPTION_KEY trigger-encryption-key true
append_compose_secret PROVIDER_SECRET trigger-provider-secret true
append_compose_secret COORDINATOR_SECRET trigger-coordinator-secret true
append_compose_secret MANAGED_WORKER_SECRET trigger-managed-worker-secret true
append_compose_secret DOCKER_REGISTRY_PASSWORD trigger-registry-password true
append_compose_secret OBJECT_STORE_SECRET_ACCESS_KEY trigger-object-store-secret-access-key true

REGISTRY_PASSWORD="$(read_environment_secret trigger-registry-password true)"
htpasswd -Bbn registry-user "${REGISTRY_PASSWORD}" >"${TRIGGER_ROOT}/registry/auth.htpasswd"
chmod 0640 "${TRIGGER_ROOT}/registry/auth.htpasswd"

cat >/etc/docker/daemon.json <<EOF
{
  "insecure-registries": ["${TRIGGER_INTERNAL_IP}:5000"]
}
EOF
systemctl enable docker
systemctl restart docker

cd "${TRIGGER_ROOT}"
"${TRIGGER_ROOT}/bin/docker-compose" --env-file "${TRIGGER_ENV_FILE}" \
  pull --ignore-pull-failures
"${TRIGGER_ROOT}/bin/docker-compose" --env-file "${TRIGGER_ENV_FILE}" up --detach --remove-orphans

for _attempt in $(seq 1 60); do
  if curl --fail --silent --show-error http://127.0.0.1:8030/healthcheck >/dev/null; then
    printf 'Trigger.dev is healthy at %s.\n' "${TRIGGER_ORIGIN}"
    exit 0
  fi
  sleep 5
done

printf 'Trigger.dev container status after failed health check:\n' >&2
"${TRIGGER_ROOT}/bin/docker-compose" --env-file "${TRIGGER_ENV_FILE}" ps >&2 || true
for service in webapp supervisor postgres clickhouse; do
  printf '\nRecent %s logs:\n' "${service}" >&2
  "${TRIGGER_ROOT}/bin/docker-compose" --env-file "${TRIGGER_ENV_FILE}" \
    logs --no-color --tail 80 "${service}" >&2 || true
done

printf 'Trigger.dev did not become healthy within five minutes.\n' >&2
exit 1
