#!/usr/bin/env bash

set -euo pipefail

FOX_CLOCKS_EXTENSION_ID="obcbigljfpgappaaofailjjoabiikckk"
BROWSER_USER="betayum-browser"
BROWSER_DATA_DIR="/var/lib/betayum-browser"
CHROME_POLICY_DIR="/etc/opt/chrome/policies/managed"
BOOTSTRAP_VERSION="3"
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
  gnupg \
  novnc \
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

if ! id "${BROWSER_USER}" >/dev/null 2>&1; then
  useradd \
    --create-home \
    --home-dir "${BROWSER_DATA_DIR}" \
    --shell /usr/sbin/nologin \
    "${BROWSER_USER}"
fi

install -d -m 0750 -o "${BROWSER_USER}" -g "${BROWSER_USER}" \
  "${BROWSER_DATA_DIR}"
install -d -m 0700 -o "${BROWSER_USER}" -g "${BROWSER_USER}" \
  "${BROWSER_DATA_DIR}/profile"
install -d -m 0755 "${CHROME_POLICY_DIR}"

cat >"${CHROME_POLICY_DIR}/betayum-extensions.json" <<EOF
{
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
  --no-default-browser-check \
  --no-first-run \
  --window-position=0,0 \
  --window-size=1440,900 \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9222 \
  --user-data-dir=/var/lib/betayum-browser/profile \
  https://console.cloud.google.com/
EOF
chmod 0755 /usr/local/bin/start-betayum-browser

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
systemctl enable --now \
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
