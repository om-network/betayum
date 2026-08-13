#!/usr/bin/env bash

set -euo pipefail

FOX_CLOCKS_EXTENSION_ID="obcbigljfpgappaaofailjjoabiikckk"
CODEX_VERSION="0.146.0"
AGENT_BROWSER_VERSION="0.33.1"
BROWSER_USER="betayum-browser"
BROWSER_DATA_DIR="/var/lib/betayum-browser"
CODEX_USER="betayum-codex"
CODEX_HOME="/var/lib/betayum-codex"
CHROME_POLICY_DIR="/etc/opt/chrome/policies/managed"
BOOTSTRAP_VERSION="12"
BOOTSTRAP_MARKER="${BROWSER_DATA_DIR}/bootstrap-version"

exec > >(tee -a /var/log/betayum-browser-bootstrap.log | logger -t betayum-browser-bootstrap -s 2>/dev/console) 2>&1

export DEBIAN_FRONTEND=noninteractive

if [[ -f "${BOOTSTRAP_MARKER}" ]] &&
  [[ "$(cat "${BOOTSTRAP_MARKER}")" == "${BOOTSTRAP_VERSION}" ]]; then
  systemctl start \
    betayum-display.service \
    betayum-browser.service \
    betayum-vnc.service \
    betayum-novnc.service
  exit 0
fi

apt-get update
apt-get install --yes --no-install-recommends \
  ca-certificates \
  curl \
  dbus-x11 \
  fonts-liberation \
  file \
  gnupg \
  novnc \
  jq \
  openssh-server \
  websockify \
  x11vnc \
  xvfb

curl --fail --silent --show-error --location \
  https://dl.google.com/linux/linux_signing_key.pub \
  | gpg --dearmor --yes --output /usr/share/keyrings/google-chrome.gpg

cat >/etc/apt/sources.list.d/google-chrome.list <<'EOF'
deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main
EOF

apt-get update
apt-get install --yes --no-install-recommends google-chrome-stable

curl --fail --silent --show-error --location \
  https://deb.nodesource.com/setup_24.x \
  | bash -
apt-get install --yes --no-install-recommends nodejs

npm install --global \
  "@openai/codex@${CODEX_VERSION}" \
  "agent-browser@${AGENT_BROWSER_VERSION}"
agent-browser install

if ! id "${BROWSER_USER}" >/dev/null 2>&1; then
  useradd \
    --create-home \
    --home-dir "${BROWSER_DATA_DIR}" \
    --shell /usr/sbin/nologin \
    "${BROWSER_USER}"
fi
if ! id "${CODEX_USER}" >/dev/null 2>&1; then
  useradd \
    --create-home \
    --home-dir "${CODEX_HOME}" \
    --shell /bin/bash \
    "${CODEX_USER}"
fi

install -d -m 0750 -o "${BROWSER_USER}" -g "${BROWSER_USER}" \
  "${BROWSER_DATA_DIR}"
install -d -m 0700 -o "${BROWSER_USER}" -g "${BROWSER_USER}" \
  "${BROWSER_DATA_DIR}/profile"
install -d -m 0700 -o "${CODEX_USER}" -g "${CODEX_USER}" \
  "${CODEX_HOME}"
install -d -m 0700 -o "${CODEX_USER}" -g "${CODEX_USER}" \
  "${CODEX_HOME}/.agents/skills/agent-browser" \
  "${CODEX_HOME}/runs"
agent-browser skills get core --full \
  >"${CODEX_HOME}/.agents/skills/agent-browser/SKILL.md"
install -d -m 0755 "${CHROME_POLICY_DIR}"

if [[ -f "${BROWSER_DATA_DIR}/codex/auth.json" ]] &&
  [[ ! -f "${CODEX_HOME}/auth.json" ]]; then
  cp "${BROWSER_DATA_DIR}/codex/auth.json" "${CODEX_HOME}/auth.json"
fi

cat >"${CODEX_HOME}/config.toml" <<'EOF'
cli_auth_credentials_store = "file"
EOF
chown -R "${CODEX_USER}:${CODEX_USER}" "${CODEX_HOME}"
chmod 0600 "${CODEX_HOME}/config.toml"

systemctl disable --now betayum-agent.service >/dev/null 2>&1 || true
pkill -u "${BROWSER_USER}" -f '/usr/bin/xterm.*Connect Codex' || true
rm -f \
  /etc/systemd/system/betayum-agent.service \
  /usr/local/bin/betayum-browser-agent \
  /usr/local/bin/start-betayum-codex-login
apt-get purge --yes xterm || true

cat >"${CHROME_POLICY_DIR}/betayum-extensions.json" <<EOF
{
  "DeveloperToolsAvailability": 1,
  "ExtensionSettings": {
    "${FOX_CLOCKS_EXTENSION_ID}": {
      "installation_mode": "force_installed",
      "toolbar_pin": "force_pinned",
      "update_url": "https://clients2.google.com/service/update2/crx"
    }
  }
}
EOF

cat >/usr/local/bin/start-betayum-browser <<'EOF'
#!/usr/bin/env bash

set -euo pipefail

exec /usr/bin/google-chrome-stable \
  --disable-dev-shm-usage \
  --hide-crash-restore-bubble \
  --disable-features=WebUIOmniboxPopup,WebUIOmniboxAimPopup,WebUIOmniboxSimplification,WebUIOmniboxFullPopup,WebUIOmniboxFullPopupV2 \
  --no-default-browser-check \
  --no-first-run \
  --window-position=0,0 \
  --window-size=1440,900 \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9222 \
  --remote-allow-origins=* \
  --user-data-dir=/var/lib/betayum-browser/profile \
  https://console.cloud.google.com/
EOF
chmod 0755 /usr/local/bin/start-betayum-browser

cat >/usr/local/bin/betayum-codex-authorized-key <<'EOF'
#!/usr/bin/env bash

set -euo pipefail

PUBLIC_KEY="$(
  curl --fail --silent --show-error \
    -H 'Metadata-Flavor: Google' \
    'http://metadata.google.internal/computeMetadata/v1/instance/attributes/betayum-codex-ssh-public-key'
)"
if [[ "${PUBLIC_KEY}" == ssh-ed25519\ * ]]; then
  printf '%s\n' "${PUBLIC_KEY}"
fi
EOF
chmod 0755 /usr/local/bin/betayum-codex-authorized-key

cat >/usr/local/bin/start-betayum-codex <<'EOF'
#!/usr/bin/env bash

set -euo pipefail

export CODEX_HOME=/var/lib/betayum-codex
export HOME=/var/lib/betayum-codex
cd /var/lib/betayum-codex

case "${SSH_ORIGINAL_COMMAND:-terminal}" in
  status)
    exec /usr/local/bin/codex login status
    ;;
  logout)
    exec /usr/local/bin/codex logout
    ;;
  terminal)
    if ! /usr/local/bin/codex login status >/dev/null 2>&1; then
      /usr/local/bin/codex login --device-auth
    fi
    exec /usr/local/bin/codex
    ;;
  automation)
    exec /usr/local/bin/dispatch-betayum-codex-automation
    ;;
  *)
    printf 'Unsupported Codex SSH command.\n' >&2
    exit 64
    ;;
esac
EOF
chmod 0755 /usr/local/bin/start-betayum-codex

cat >/usr/local/bin/dispatch-betayum-codex-automation <<'EOF'
#!/usr/bin/env bash

set -euo pipefail

export HOME=/var/lib/betayum-codex
REQUEST_FILE="$(mktemp /var/lib/betayum-codex/request.XXXXXX)"
dd of="${REQUEST_FILE}" status=none
RUN_ID="$(jq -er '.runId' "${REQUEST_FILE}")"
if [[ ! "${RUN_ID}" =~ ^car_[A-Za-z0-9]+$ ]]; then
  rm -f "${REQUEST_FILE}"
  printf 'Invalid automation run ID.\n' >&2
  exit 64
fi
nohup flock --exclusive /var/lib/betayum-codex/automation.lock bash -c '
  request_file="$1"
  run_id="$2"
  /usr/local/bin/run-betayum-codex-automation <"${request_file}" \
    >"/var/lib/betayum-codex/${run_id}.log" 2>&1
  exit_code=$?
  rm -f "${request_file}"
  exit "${exit_code}"
' _ "${REQUEST_FILE}" "${RUN_ID}" >/dev/null 2>&1 &
printf 'Automation dispatched.\n'
EOF
chmod 0755 /usr/local/bin/dispatch-betayum-codex-automation

cat >/usr/local/bin/run-betayum-codex-automation <<'EOF'
#!/usr/bin/env bash

set -euo pipefail

export CODEX_HOME=/var/lib/betayum-codex
export HOME=/var/lib/betayum-codex
REQUEST_FILE="$(mktemp)"
RUN_DIR=""
trap 'rm -f "${REQUEST_FILE}"' EXIT
umask 077
dd of="${REQUEST_FILE}" status=none

RUN_ID="$(jq -er '.runId' "${REQUEST_FILE}")"
if [[ ! "${RUN_ID}" =~ ^car_[A-Za-z0-9]+$ ]]; then
  printf 'Invalid automation run ID.\n' >&2
  exit 64
fi
RUN_DIR="${CODEX_HOME}/runs/${RUN_ID}"
if [[ -e "${RUN_DIR}" ]]; then
  printf 'Automation run directory already exists.\n' >&2
  exit 73
fi
install -d -m 0700 -o betayum-codex -g betayum-codex \
  "${RUN_DIR}/screenshots"

PROMPT="$(jq -er '.prompt' "${REQUEST_FILE}")"
EVIDENCE="$(jq -er '.evidenceDescription' "${REQUEST_FILE}")"
cat >"${RUN_DIR}/instructions.txt" <<INSTRUCTIONS
Read the agent-browser skill at /var/lib/betayum-codex/.agents/skills/agent-browser/SKILL.md.
Use shell commands in the form "agent-browser --session ${RUN_ID} --cdp 9222 <command>".
First verify the connection with "agent-browser --session ${RUN_ID} --cdp 9222 get title".
Do not use web search or HTTP requests to inspect localhost. Control only the existing
visible Chrome session on CDP port 9222 through agent-browser.
Run only one agent-browser command at a time. Never run browser commands concurrently.
Google Cloud Console pages can take a long time to render. Open each target URL only once.
After opening it, wait on that same page and inspect its title, URL, or visible content until
it is ready. Do not reload or reopen the page because a wait, snapshot, or navigation command
timed out. Do not wait for network idle on Google Cloud Console. Never kill or restart Chrome,
its renderers, or agent-browser. After two consecutive failures on the same page, preserve the
screenshots already captured and finish with a partial-results summary.
Complete this browser task: ${PROMPT}
Capture evidence for: ${EVIDENCE}
Write PNG or JPEG screenshots directly under screenshots/. Do not create subdirectories.
Create no more than 10 screenshots. End with a concise text summary.
INSTRUCTIONS

cd "${RUN_DIR}"
/usr/local/bin/codex exec \
  --sandbox danger-full-access \
  --skip-git-repo-check \
  --output-last-message summary.txt \
  "$(cat instructions.txt)"

mapfile -d '' SCREENSHOTS < <(
  find "${RUN_DIR}/screenshots" -mindepth 1 -maxdepth 1 -type f -print0
)
if (( "${#SCREENSHOTS[@]}" > 10 )); then
  printf 'Codex produced more than 10 screenshots.\n' >&2
  exit 65
fi

TOTAL_BYTES=0
REFERENCES='[]'
API_BASE_URL="$(jq -er '.apiBaseUrl' "${REQUEST_FILE}")"
CAPABILITY_TOKEN="$(jq -er '.capabilityToken' "${REQUEST_FILE}")"
for SCREENSHOT in "${SCREENSHOTS[@]}"; do
  if [[ -L "${SCREENSHOT}" ]]; then
    printf 'Screenshot symlinks are not allowed.\n' >&2
    exit 65
  fi
  SIZE_BYTES="$(stat --format=%s "${SCREENSHOT}")"
  TOTAL_BYTES=$((TOTAL_BYTES + SIZE_BYTES))
  if (( SIZE_BYTES > 10485760 || TOTAL_BYTES > 52428800 )); then
    printf 'Screenshot evidence size limit exceeded.\n' >&2
    exit 65
  fi
  MIME_TYPE="$(file --brief --mime-type "${SCREENSHOT}")"
  if [[ "${MIME_TYPE}" != "image/png" && "${MIME_TYPE}" != "image/jpeg" ]]; then
    printf 'Unsupported screenshot MIME type.\n' >&2
    exit 65
  fi
  UPLOAD_JSON="${SCREENSHOT}.upload.json"
  node - "${SCREENSHOT}" "${MIME_TYPE}" "${UPLOAD_JSON}" <<'NODE'
const fs = require('node:fs');
const [input, mimeType, output] = process.argv.slice(2);
fs.writeFileSync(output, JSON.stringify({
  fileData: fs.readFileSync(input).toString('base64'),
  fileName: require('node:path').basename(input),
  mimeType,
}));
NODE
  RESPONSE="$(
    curl --fail --silent --show-error \
      -H "Authorization: Bearer ${CAPABILITY_TOKEN}" \
      -H 'Content-Type: application/json' \
      --data-binary "@${UPLOAD_JSON}" \
      "${API_BASE_URL}/v1/codex-automation/runs/${RUN_ID}/screenshots"
  )"
  rm -f "${UPLOAD_JSON}"
  REFERENCES="$(jq --argjson uploaded "${RESPONSE}" '. + [$uploaded]' <<<"${REFERENCES}")"
done

COMPLETION="$(jq -cn \
  --arg summary "$(cat summary.txt)" \
  --argjson screenshots "${REFERENCES}" \
  '{screenshots: $screenshots, summary: $summary}')"
curl --fail --silent --show-error \
    --retry 8 \
    --retry-all-errors \
    --retry-delay 2 \
    --retry-max-time 300 \
    -H "Authorization: Bearer ${CAPABILITY_TOKEN}" \
    -H 'Content-Type: application/json' \
    --data-binary "${COMPLETION}" \
    "${API_BASE_URL}/v1/codex-automation/runs/${RUN_ID}/complete" \
    >/dev/null
rm -rf -- "${RUN_DIR}"
EOF
chmod 0755 /usr/local/bin/run-betayum-codex-automation

cat >/etc/systemd/system/betayum-codex-run-cleanup.service <<'EOF'
[Unit]
Description=Remove abandoned Codex automation run files

[Service]
Type=oneshot
ExecStart=/usr/bin/find /var/lib/betayum-codex/runs -mindepth 1 -maxdepth 1 -type d -mmin +1440 -exec rm -rf -- {} +
ExecStart=/usr/bin/find /var/lib/betayum-codex -mindepth 1 -maxdepth 1 -type f \( -name 'car_*.log' -o -name 'request.*' \) -mmin +1440 -delete
EOF

cat >/etc/systemd/system/betayum-codex-run-cleanup.timer <<'EOF'
[Unit]
Description=Daily cleanup of abandoned Codex automation runs

[Timer]
OnBootSec=15min
OnUnitActiveSec=1h
Persistent=true

[Install]
WantedBy=timers.target
EOF

cat >/etc/ssh/sshd_config.d/60-betayum-codex.conf <<EOF
Match User ${CODEX_USER}
  AuthorizedKeysCommand /usr/local/bin/betayum-codex-authorized-key
  AuthorizedKeysCommandUser nobody
  ForceCommand /usr/local/bin/start-betayum-codex
  DisableForwarding yes
  PasswordAuthentication no
  PermitTTY yes
  X11Forwarding no
EOF
sshd -t

cat >/usr/local/bin/start-betayum-novnc <<'EOF'
#!/usr/bin/env bash

set -euo pipefail

INTERNAL_IP="$(
  curl --fail --silent \
    -H 'Metadata-Flavor: Google' \
    'http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/ip'
)"

exec /usr/bin/websockify \
  --web=/usr/share/novnc \
  "${INTERNAL_IP}:6080" \
  127.0.0.1:5900
EOF
chmod 0755 /usr/local/bin/start-betayum-novnc

cat >/etc/systemd/system/betayum-display.service <<EOF
[Unit]
Description=Betayum virtual desktop
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${BROWSER_USER}
Group=${BROWSER_USER}
ExecStart=/usr/bin/Xvfb :99 -screen 0 1440x900x24 -nolisten tcp -ac
Restart=always
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

cat >/etc/systemd/system/betayum-browser.service <<EOF
[Unit]
Description=Betayum organization browser
After=betayum-display.service network-online.target
Requires=betayum-display.service

[Service]
Type=simple
User=${BROWSER_USER}
Group=${BROWSER_USER}
Environment=DISPLAY=:99
ExecStart=/usr/local/bin/start-betayum-browser
Restart=always
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

cat >/etc/systemd/system/betayum-vnc.service <<EOF
[Unit]
Description=Betayum localhost VNC bridge
After=betayum-display.service
Requires=betayum-display.service

[Service]
Type=simple
User=${BROWSER_USER}
Group=${BROWSER_USER}
ExecStart=/usr/bin/x11vnc -display :99 -rfbport 5900 -localhost -forever -shared -nopw -noxdamage
Restart=always
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

cat >/etc/systemd/system/betayum-novnc.service <<EOF
[Unit]
Description=Betayum private noVNC web client
After=betayum-vnc.service
Requires=betayum-vnc.service

[Service]
Type=simple
User=${BROWSER_USER}
Group=${BROWSER_USER}
ExecStart=/usr/local/bin/start-betayum-novnc
Restart=always
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl restart ssh.service
systemctl enable --now \
  betayum-codex-run-cleanup.timer \
  betayum-display.service \
  betayum-browser.service \
  betayum-vnc.service \
  betayum-novnc.service

EXTENSION_DIR="${BROWSER_DATA_DIR}/profile/Default/Extensions/${FOX_CLOCKS_EXTENSION_ID}"
for _attempt in $(seq 1 60); do
  if [[ -n "$(find "${EXTENSION_DIR}" -mindepth 1 -maxdepth 1 -type d -print -quit 2>/dev/null)" ]]; then
    systemctl restart betayum-browser.service
    google-chrome-stable --version >"${BROWSER_DATA_DIR}/foxclocks-ready"
    printf '%s\n' "${BOOTSTRAP_VERSION}" >"${BOOTSTRAP_MARKER}"
    chown "${BROWSER_USER}:${BROWSER_USER}" "${BROWSER_DATA_DIR}/foxclocks-ready"
    chown "${BROWSER_USER}:${BROWSER_USER}" "${BOOTSTRAP_MARKER}"
    logger -t betayum-browser-bootstrap "FoxClocks extension installed successfully"
    exit 0
  fi

  sleep 5
done

logger -t betayum-browser-bootstrap "FoxClocks extension installation timed out"
exit 1
