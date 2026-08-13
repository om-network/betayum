import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('.', import.meta.url).pathname;
const paths = {
  startup: join(root, 'browser-vm-startup.sh'),
  create: join(root, 'create-browser-vm.sh'),
  foundation: join(root, 'provision-browser-vm-foundation.sh'),
  tunnel: join(root, 'open-browser-vm-tunnel.sh'),
  upgrade: join(root, 'upgrade-browser-vm.sh'),
};
const files = Object.fromEntries(
  Object.entries(paths).map(([name, path]) => [
    name,
    readFileSync(path, 'utf8'),
  ]),
);

for (const path of Object.values(paths)) {
  execFileSync('bash', ['-n', path]);
}

function requireText({
  file,
  label,
  requirements,
}) {
  for (const requirement of requirements) {
    if (!file.includes(requirement)) {
      throw new Error(`${label} is missing: ${requirement}`);
    }
  }
}

requireText({
  file: files.startup,
  label: 'Browser VM startup',
  requirements: [
    'obcbigljfpgappaaofailjjoabiikckk',
    '"installation_mode": "force_installed"',
    '"toolbar_pin": "force_pinned"',
    'google-chrome-stable',
    '--remote-debugging-address=127.0.0.1',
    'CODEX_VERSION="0.146.0"',
    'CODEX_USER="betayum-codex"',
    'cli_auth_credentials_store = "file"',
    'openssh-server',
    'betayum-codex-ssh-public-key',
    'AuthorizedKeysCommandUser nobody',
    'ForceCommand /usr/local/bin/start-betayum-codex',
    'automation)',
    'flock --exclusive /var/lib/betayum-codex/automation.lock',
    'Open each target URL only once.',
    'Do not reload or reopen the page',
    'Never run browser commands concurrently.',
    '/v1/codex-automation/runs/${RUN_ID}/complete',
    '--retry 8',
    'DisableForwarding yes',
    'PasswordAuthentication no',
    'codex login --device-auth',
    'exec /usr/local/bin/codex login status',
    'exec /usr/local/bin/codex logout',
    '"${INTERNAL_IP}:6080"',
    '127.0.0.1:5900',
    'bootstrap-version',
    'foxclocks-ready',
  ],
});

for (const forbidden of [
  'betayum-agent.service\n[Unit]',
  'ExecStart=/usr/bin/xterm',
  '--remote-debugging-address=0.0.0.0',
]) {
  if (files.startup.includes(forbidden)) {
    throw new Error(`Browser VM startup contains forbidden text: ${forbidden}`);
  }
}
if (/0\.0\.0\.0:(5900|6080|6081)/.test(files.startup)) {
  throw new Error('Desktop viewer ports must not be exposed publicly');
}
for (const forbidden of [
  'pubsub.googleapis.com',
  'betayum-codex-pubsub-topic',
]) {
  if (files.startup.includes(forbidden)) {
    throw new Error(`Browser VM startup contains forbidden text: ${forbidden}`);
  }
}

requireText({
  file: files.create,
  label: 'Browser VM creation script',
  requirements: [
    'BETAYUM_GCP_PROJECT',
    'browser-vm-startup.sh',
    'enable-oslogin=FALSE,block-project-ssh-keys=TRUE',
    'BETAYUM_BROWSER_VM_PRIVATE',
    '--no-address',
    '--no-service-account',
  ],
});
if (files.create.includes('browser-vm-agent.py')) {
  throw new Error('Browser VM creation must not install the removed agent');
}

requireText({
  file: files.foundation,
  label: 'Browser VM foundation',
  requirements: [
    'gcloud compute networks create',
    'gcloud compute networks subnets create',
    '--enable-private-ip-google-access',
    'gcloud compute routers nats create',
    '--nat-custom-subnet-ip-ranges="${SUBNET}:ALL"',
    '--source-tags=betayum-api',
    '--target-tags=betayum-browser-vm',
    '--rules=tcp:22,tcp:6080',
    'gcloud compute instance-templates create',
    'enable-oslogin=FALSE,block-project-ssh-keys=TRUE',
    '--no-address',
    '--no-service-account',
    'compute.instances.setMetadata',
    'BETAYUM_CONFIGURE_CLOUD_RUN:-false',
    'BROWSER_VM_INSTANCE_TEMPLATE',
  ],
});
if (
  files.foundation.includes('browser-vm-agent') ||
  files.foundation.includes('tcp:6081')
) {
  throw new Error('Browser VM foundation still references the removed agent');
}

requireText({
  file: files.tunnel,
  label: 'Browser VM local tunnel',
  requirements: [
    'BETAYUM_BROWSER_VM_LOCAL_PORT',
    'BETAYUM_BROWSER_VM_LOCAL_SSH_PORT',
    '--tunnel-through-iap',
    'BETAYUM_BROWSER_VM_TUNNEL_MODE',
    '127.0.0.1:${LOCAL_PORT}:${INTERNAL_IP}:6080',
    '127.0.0.1:${LOCAL_SSH_PORT}:${INTERNAL_IP}:22',
    'BROWSER_VM_LOCAL_VIEWER_URL=http://127.0.0.1:',
    'BROWSER_VM_LOCAL_SSH_HOST=127.0.0.1',
    'BROWSER_VM_LOCAL_SSH_PORT=',
    'ExitOnForwardFailure=yes',
  ],
});
if (files.tunnel.includes('LOCAL_AGENT')) {
  throw new Error('Browser VM tunnel still forwards the removed agent');
}

requireText({
  file: files.upgrade,
  label: 'Browser VM upgrade script',
  requirements: [
    'browser-vm-startup.sh',
    'enable-oslogin=FALSE,block-project-ssh-keys=TRUE',
    'remove-metadata',
    '--keys=betayum-agent-token,betayum-browser-agent',
    'google_metadata_script_runner startup',
    'bootstrap-version',
  ],
});

console.log('Browser VM desktop, restricted Codex SSH, and gcloud scripts are valid.');
