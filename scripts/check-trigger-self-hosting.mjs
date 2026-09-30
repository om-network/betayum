import { existsSync, readFileSync, readdirSync } from 'node:fs';

const requiredFiles = [
  'infra/gcp/trigger.tf',
  'infra/gcp/trigger/compose.yaml',
  'infra/gcp/trigger/deployer.Dockerfile',
  'infra/gcp/trigger/startup.sh',
  'infra/gcp/trigger/deploy.sh',
  'infra/gcp/trigger/secret-env.sh',
];

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    throw new Error(`Missing Trigger.dev self-hosting file: ${file}`);
  }
}

const cloudbuild = readFileSync('cloudbuild.yaml', 'utf8');
const triggerTerraform = readFileSync('infra/gcp/trigger.tf', 'utf8');
const edgeTerraform = readFileSync('infra/gcp/edge.tf', 'utf8');
const compose = readFileSync('infra/gcp/trigger/compose.yaml', 'utf8');
const triggerConfig = readFileSync('apps/app/trigger.config.ts', 'utf8');
const workflows = readdirSync('.github/workflows')
  .filter((file) => file.endsWith('.yml'))
  .map((file) => readFileSync(`.github/workflows/${file}`, 'utf8'));

const requiredCloudBuildSnippets = [
  'build-trigger-deployer',
  'push-trigger-deployer',
  'package-trigger-source',
  'deploy-trigger-tasks',
  'scripts/deploy-trigger-tasks-gce.sh',
  'TRIGGER_API_URL=${_TRIGGER_URL}',
];

const requiredTerraformSnippets = [
  'google_compute_instance" "trigger',
  'google_compute_network" "trigger',
  'google_compute_router_nat" "trigger',
  'google_compute_instance_group" "trigger',
  'google_service_account" "trigger',
  'deletion_protection',
];

const requiredComposeSnippets = [
  'ghcr.io/triggerdotdev/trigger.dev:v4.5.9@',
  'ghcr.io/triggerdotdev/supervisor:v4.5.9@',
  'REALTIME_STREAMS_DEFAULT_VERSION: v1',
  '/var/run/docker.sock:/var/run/docker.sock:ro',
];

function assertIncludes(source, snippets, label) {
  for (const snippet of snippets) {
    if (!source.includes(snippet)) {
      throw new Error(`${label} is missing: ${snippet}`);
    }
  }
}

assertIncludes(cloudbuild, requiredCloudBuildSnippets, 'cloudbuild.yaml');
assertIncludes(triggerTerraform, requiredTerraformSnippets, 'Trigger.dev Terraform');
assertIncludes(edgeTerraform, ['google_compute_backend_service.trigger'], 'edge.tf');
assertIncludes(compose, requiredComposeSnippets, 'Trigger.dev compose stack');
assertIncludes(triggerConfig, ['syncEnvVars(', 'isSecret: true'], 'trigger.config.ts');

for (const workflow of workflows) {
  if (workflow.includes('trigger.dev@') && workflow.includes(' deploy')) {
    throw new Error('Trigger.dev task deployment must be owned by Cloud Build');
  }
}

console.log('Trigger.dev self-hosting is wired through Cloud Build and Compute Engine.');
