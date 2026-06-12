import { readFileSync } from 'node:fs';

const cloudbuild = readFileSync('cloudbuild.yaml', 'utf8');
const infraTrigger = readFileSync('infra/gcp/cloudbuild.tf', 'utf8');
const runbook = readFileSync('docs/deploy/cloud-build-cloud-run.md', 'utf8');

const requiredPipelineSnippets = [
  '$COMMIT_SHA',
  'apps/api/Dockerfile.multistage',
  '--target=app',
  '--target=portal',
  '--target=migrator',
  'jobs',
  'update',
  'execute',
  '--wait',
  'deploy',
  'curl --fail',
  '/v1/health',
  '/api/health',
];

const requiredTriggerSnippets = [
  'branch = "^${each.value.branch_name}$"',
  'approval_required = each.value.approval_required',
  '_MIGRATOR_JOB',
  '_API_URL',
  '_PORTAL_URL',
];

const requiredRunbookSnippets = [
  'develop',
  'release',
  'approval',
  'migration job',
  'Cloud Build logs',
  'database-migrations-main.yml',
  'database-migrations-release.yml',
];

function assertIncludes({
  source,
  snippets,
  label,
}) {
  for (const snippet of snippets) {
    if (!source.includes(snippet)) {
      throw new Error(`${label} is missing: ${snippet}`);
    }
  }
}

assertIncludes({
  source: cloudbuild,
  snippets: requiredPipelineSnippets,
  label: 'cloudbuild.yaml',
});
assertIncludes({
  source: infraTrigger,
  snippets: requiredTriggerSnippets,
  label: 'Cloud Build Terraform trigger',
});
assertIncludes({
  source: runbook,
  snippets: requiredRunbookSnippets,
  label: 'Cloud Build runbook',
});

console.log('Cloud Build deploy contract is documented and wired.');
