import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('.', import.meta.url).pathname;
const startupPath = join(root, 'browser-vm-startup.sh');
const createPath = join(root, 'create-browser-vm.sh');
const foundationPath = join(root, 'provision-browser-vm-foundation.sh');
const tunnelPath = join(root, 'open-browser-vm-tunnel.sh');
const startup = readFileSync(startupPath, 'utf8');
const create = readFileSync(createPath, 'utf8');
const foundation = readFileSync(foundationPath, 'utf8');
const tunnel = readFileSync(tunnelPath, 'utf8');

execFileSync('bash', ['-n', startupPath]);
execFileSync('bash', ['-n', createPath]);
execFileSync('bash', ['-n', foundationPath]);
execFileSync('bash', ['-n', tunnelPath]);

const startupRequirements = [
  'obcbigljfpgappaaofailjjoabiikckk',
  '"installation_mode": "force_installed"',
  '"toolbar_pin": "force_pinned"',
  'https://clients2.google.com/service/update2/crx',
  '/etc/opt/chrome/policies/managed',
  'google-chrome-stable',
  '--hide-crash-restore-bubble',
  '--window-position=0,0',
  '--window-size=1440,900',
  '--remote-debugging-address=127.0.0.1',
  'betayum-browser.service',
  'betayum-display.service',
  'betayum-vnc.service',
  'betayum-novnc.service',
  'metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/ip',
  '"${INTERNAL_IP}:6080"',
  '127.0.0.1:5900',
  'systemctl restart betayum-browser.service',
  'https://console.cloud.google.com/',
  'bootstrap-version',
  'foxclocks-ready',
];

for (const requirement of startupRequirements) {
  if (!startup.includes(requirement)) {
    throw new Error(`Browser VM startup is missing: ${requirement}`);
  }
}

if (startup.includes('--remote-debugging-address=0.0.0.0')) {
  throw new Error('Chrome remote debugging must not be exposed publicly');
}

if (/0\.0\.0\.0:(5900|6080)/.test(startup)) {
  throw new Error('Desktop viewer ports must not be exposed publicly');
}

if (/codex|credential|access[_-]?token|refresh[_-]?token/i.test(startup)) {
  throw new Error('FoxClocks prototype must not configure Codex or credentials');
}

if (
  startup.indexOf('systemctl restart betayum-browser.service') >
  startup.indexOf('foxclocks-ready')
) {
  throw new Error('Chrome must restart before FoxClocks is marked ready');
}

const createRequirements = [
  'BETAYUM_GCP_PROJECT',
  'browser-vm-startup.sh',
  'enable-oslogin=FALSE',
  'BETAYUM_BROWSER_VM_PRIVATE',
  '--no-address',
  '--no-service-account',
  '--no-scopes',
  'component=browser-automation,purpose=foxclocks-poc',
];

for (const requirement of createRequirements) {
  if (!create.includes(requirement)) {
    throw new Error(`Browser VM creation script is missing: ${requirement}`);
  }
}

const foundationRequirements = [
  'gcloud compute networks create',
  'gcloud compute networks subnets create',
  '--enable-private-ip-google-access',
  'gcloud compute routers nats create',
  '--nat-custom-subnet-ip-ranges="${SUBNET}:ALL"',
  'gcloud compute firewall-rules create',
  '--source-tags=betayum-api',
  '--target-tags=betayum-browser-vm',
  '--rules=tcp:6080',
  'gcloud compute instance-templates create',
  '--metadata-from-file="startup-script=${STARTUP_SCRIPT}"',
  '--no-address',
  '--no-service-account',
  'gcloud iam roles create',
  'BETAYUM_CONFIGURE_IAM',
  'compute.instances.create',
  'compute.instances.start',
  'compute.instances.stop',
  'gcloud run services update',
  'BETAYUM_CONFIGURE_CLOUD_RUN:-false',
  '--network-tags=betayum-api',
  '--vpc-egress=private-ranges-only',
  'BROWSER_VM_INSTANCE_TEMPLATE',
];

for (const requirement of foundationRequirements) {
  if (!foundation.includes(requirement)) {
    throw new Error(`Browser VM foundation is missing: ${requirement}`);
  }
}

if (/--address(?:=|\\s)/.test(foundation)) {
  throw new Error('Organization browser VM templates must not use external IPs');
}

const tunnelRequirements = [
  'BETAYUM_BROWSER_VM_NAME',
  'BETAYUM_BROWSER_VM_LOCAL_PORT',
  '--tunnel-through-iap',
  'BETAYUM_BROWSER_VM_TUNNEL_MODE',
  'BETAYUM_BROWSER_VM_SSH_KEY_FILE',
  "ssh-keygen -q -t ed25519",
  'https://checkip.amazonaws.com',
  '--source-ranges="${CLIENT_IP}/32"',
  'delete-access-config',
  '127.0.0.1:${LOCAL_PORT}:${INTERNAL_IP}:6080',
  'BROWSER_VM_LOCAL_VIEWER_URL=http://127.0.0.1:',
];

for (const requirement of tunnelRequirements) {
  if (!tunnel.includes(requirement)) {
    throw new Error(`Browser VM local tunnel is missing: ${requirement}`);
  }
}

console.log('Browser VM bootstrap, prototype, and gcloud foundation are valid.');
