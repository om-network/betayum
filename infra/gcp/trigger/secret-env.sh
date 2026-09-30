#!/usr/bin/env bash

set -euo pipefail

METADATA_ROOT="http://metadata.google.internal/computeMetadata/v1"

metadata_value() {
  curl --fail --silent --show-error \
    -H 'Metadata-Flavor: Google' \
    "${METADATA_ROOT}/$1"
}

initialize_secret_context() {
  TRIGGER_GCP_PROJECT="$(metadata_value project/project-id)"
  TRIGGER_ENVIRONMENT="$(metadata_value instance/attributes/betayum-environment)"
  TRIGGER_ACCESS_TOKEN="$(
    metadata_value instance/service-accounts/default/token | jq -er '.access_token'
  )"
}

read_environment_secret() {
  local suffix="$1"
  local required="${2:-false}"
  local secret_name="betayum-${TRIGGER_ENVIRONMENT}-${suffix}"
  local response

  if ! response="$(
    curl --fail --silent --show-error \
      -H "Authorization: Bearer ${TRIGGER_ACCESS_TOKEN}" \
      "https://secretmanager.googleapis.com/v1/projects/${TRIGGER_GCP_PROJECT}/secrets/${secret_name}/versions/latest:access"
  )"; then
    if [[ "${required}" == "true" ]]; then
      printf 'Required Secret Manager value is unavailable: %s\n' "${secret_name}" >&2
      return 1
    fi
    return 2
  fi

  jq -er '.payload.data' <<<"${response}" | base64 --decode
}

append_compose_secret() {
  local variable_name="$1"
  local secret_suffix="$2"
  local required="${3:-false}"
  local value

  if ! value="$(read_environment_secret "${secret_suffix}" "${required}")"; then
    [[ "${required}" == "true" ]] && return 1
    return 0
  fi
  if [[ "${value}" == *$'\n'* || "${value}" == *"'"* ]]; then
    printf 'Secret %s must be a single line without single quotes.\n' "${secret_suffix}" >&2
    return 1
  fi
  printf "%s='%s'\n" "${variable_name}" "${value}" >>"${TRIGGER_ENV_FILE}"
}

append_docker_secret() {
  local variable_name="$1"
  local secret_suffix="$2"
  local required="${3:-false}"
  local value

  if ! value="$(read_environment_secret "${secret_suffix}" "${required}")"; then
    [[ "${required}" == "true" ]] && return 1
    return 0
  fi
  if [[ "${value}" == *$'\n'* ]]; then
    printf 'Secret %s must be a single line.\n' "${secret_suffix}" >&2
    return 1
  fi
  printf '%s=%s\n' "${variable_name}" "${value}" >>"${TRIGGER_RUNTIME_ENV_FILE}"
}
