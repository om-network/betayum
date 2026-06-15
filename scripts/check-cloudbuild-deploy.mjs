import { readFileSync } from 'node:fs';

const cloudbuild = readFileSync('cloudbuild.yaml', 'utf8');
const infraTrigger = readFileSync('infra/gcp/cloudbuild.tf', 'utf8');
const infraVariables = readFileSync('infra/gcp/variables.tf', 'utf8');
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
  '_AUTH_PRIMARY_DOMAIN',
  '_AUTH_STAGING_DOMAIN',
  '--update-env-vars=BASE_URL=${_API_URL}',
  'NEXT_PUBLIC_API_URL=${_API_URL}',
  'NEXT_PUBLIC_PORTAL_URL=${_PORTAL_URL}',
];

const requiredTriggerSnippets = [
  'branch = "^${each.value.branch_name}$"',
  'approval_required = each.value.approval_required',
  '_MIGRATOR_JOB',
  '_API_URL',
  '_PORTAL_URL',
  '_AUTH_PRIMARY_DOMAIN',
  '_AUTH_STAGING_DOMAIN',
];

const requiredTriggerInputSnippets = [
  '.dockerignore',
  'bun.lock',
  'bunfig.toml',
  'package.json',
  'tsconfig.json',
  'turbo.json',
];

const requiredRunbookSnippets = [
  'develop',
  'release',
  'approval',
  'migration job',
  'gated-parallel',
  'single required gate',
  'run in parallel',
  'Cloud Build logs',
  'database-migrations-main.yml',
  'database-migrations-release.yml',
];

const expectedStepDependencies = {
  'build-api': ['-'],
  'build-app': ['-'],
  'build-portal': ['-'],
  'build-migrator': ['-'],
  'push-api': ['build-api'],
  'push-app': ['build-app'],
  'push-portal': ['build-portal'],
  'push-migrator': ['build-migrator'],
  'update-migrator-job': ['push-migrator'],
  'run-migrations': ['update-migrator-job'],
  'deploy-api': ['run-migrations', 'push-api'],
  'deploy-app': ['run-migrations', 'push-app'],
  'deploy-portal': ['run-migrations', 'push-portal'],
  'smoke-api': ['deploy-api', 'deploy-app', 'deploy-portal'],
  'smoke-app': ['deploy-api', 'deploy-app', 'deploy-portal'],
  'smoke-portal': ['deploy-api', 'deploy-app', 'deploy-portal'],
};

const serviceDeploySteps = ['deploy-api', 'deploy-app', 'deploy-portal'];

function assertIncludes({ source, snippets, label }) {
  for (const snippet of snippets) {
    if (!source.includes(snippet)) {
      throw new Error(`${label} is missing: ${snippet}`);
    }
  }
}

function normalizeYamlValue(value) {
  return value.trim().replace(/^['"]|['"]$/g, '');
}

function parseStepDependencies(source) {
  const dependencies = new Map();
  let currentStepId = null;
  let readingWaitFor = false;

  for (const line of source.split('\n')) {
    const stepMatch = line.match(/^  - id: (.+)$/);
    if (stepMatch) {
      currentStepId = normalizeYamlValue(stepMatch[1]);
      dependencies.set(currentStepId, []);
      readingWaitFor = false;
      continue;
    }

    if (!currentStepId) {
      continue;
    }

    if (line.match(/^    waitFor:$/)) {
      readingWaitFor = true;
      continue;
    }

    if (readingWaitFor) {
      const dependencyMatch = line.match(/^      - (.+)$/);
      if (dependencyMatch) {
        dependencies.get(currentStepId).push(normalizeYamlValue(dependencyMatch[1]));
        continue;
      }

      readingWaitFor = false;
    }
  }

  return dependencies;
}

function assertSameDependencies({ actual, expected, stepId }) {
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();

  if (sortedActual.length !== sortedExpected.length) {
    throw new Error(
      `cloudbuild.yaml step "${stepId}" waitFor mismatch: expected ${sortedExpected.join(', ')}, received ${sortedActual.join(', ')}`,
    );
  }

  for (const [index, dependency] of sortedExpected.entries()) {
    if (sortedActual[index] !== dependency) {
      throw new Error(
        `cloudbuild.yaml step "${stepId}" waitFor mismatch: expected ${sortedExpected.join(', ')}, received ${sortedActual.join(', ')}`,
      );
    }
  }
}

function assertGatedParallelGraph(source) {
  const dependencies = parseStepDependencies(source);

  for (const [stepId, expectedDependencies] of Object.entries(expectedStepDependencies)) {
    if (!dependencies.has(stepId)) {
      throw new Error(`cloudbuild.yaml is missing step "${stepId}"`);
    }

    assertSameDependencies({
      actual: dependencies.get(stepId),
      expected: expectedDependencies,
      stepId,
    });
  }

  for (const stepId of serviceDeploySteps) {
    const deployDependencies = dependencies.get(stepId);
    for (const otherStepId of serviceDeploySteps) {
      if (stepId !== otherStepId && deployDependencies.includes(otherStepId)) {
        throw new Error(`cloudbuild.yaml step "${stepId}" must not wait for sibling service deploy "${otherStepId}"`);
      }
    }
  }
}

assertIncludes({
  source: cloudbuild,
  snippets: requiredPipelineSnippets,
  label: 'cloudbuild.yaml',
});
assertGatedParallelGraph(cloudbuild);
assertIncludes({
  source: infraTrigger,
  snippets: requiredTriggerSnippets,
  label: 'Cloud Build Terraform trigger',
});
assertIncludes({
  source: infraVariables,
  snippets: requiredTriggerInputSnippets,
  label: 'Cloud Build trigger input allowlist',
});
assertIncludes({
  source: runbook,
  snippets: requiredRunbookSnippets,
  label: 'Cloud Build runbook',
});

console.log('Cloud Build deploy contract is documented and wired.');
