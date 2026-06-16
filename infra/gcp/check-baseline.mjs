import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('.', import.meta.url).pathname;

const requiredFiles = [
  'versions.tf',
  'variables.tf',
  'locals.tf',
  'iam.tf',
  'services.tf',
  'edge.tf',
  'cloudbuild.tf',
  'outputs.tf',
  'terraform.tfvars.example',
  'README.md',
];

const requiredSnippets = [
  'google_project_service',
  'google_artifact_registry_repository',
  'google_cloud_run_v2_service',
  'google_cloud_run_v2_service_iam_member',
  'google_cloud_run_v2_job',
  'google_secret_manager_secret',
  'google_storage_bucket',
  'google_storage_bucket_iam_member',
  'google_cloudbuild_trigger',
  'approval_required',
  'mount_runtime_secrets',
  'APP_OBJECT_STORAGE_BUCKET',
  'APP_DEVICE_AGENT_ARTIFACTS_BUCKET',
  '_DB_JOB_SERVICE_ACCOUNT',
  'AUTH_PRIMARY_DOMAIN',
  'better-auth-api-key',
  'auth-google-id',
  'auth-microsoft-client-secret',
  'NEXT_PUBLIC_API_URL',
  'roles/run.invoker',
  'google_compute_managed_ssl_certificate',
  'google_compute_region_network_endpoint_group',
  'google_compute_backend_service',
  'google_logging_project_bucket_config',
];

for (const file of requiredFiles) {
  readFileSync(join(root, file), 'utf8');
}

const terraformSource = requiredFiles
  .filter((file) => file.endsWith('.tf'))
  .map((file) => readFileSync(join(root, file), 'utf8'))
  .join('\n');

for (const snippet of requiredSnippets) {
  if (!terraformSource.includes(snippet)) {
    throw new Error(`Missing required Terraform declaration: ${snippet}`);
  }
}

const example = readFileSync(join(root, 'terraform.tfvars.example'), 'utf8');
if (/password|secret-value|private-key/i.test(example)) {
  throw new Error('Example variables must not include secret values');
}

if (terraformSource.includes('roles/secretmanager.secretAccessor",\n  ])')) {
  throw new Error('Cloud Build deployer must not have project-wide secret access');
}

console.log('GCP IaC baseline files are present and cover required resources.');
