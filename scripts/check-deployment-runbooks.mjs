import { readFileSync } from 'node:fs';

const edge = readFileSync('docs/deploy/cloud-run-managed-edge-cutover.md', 'utf8');
const evidence = readFileSync('docs/deploy/iso-deployment-evidence.md', 'utf8');

const edgeSnippets = [
  'app.staging.betayum.com',
  'api.staging.betayum.com',
  'portal.staging.betayum.com',
  'app.betayum.com',
  'api.betayum.com',
  'portal.betayum.com',
  'managed certificate',
  'Internal and Cloud Load Balancing',
  'OAuth callback',
  'rollback',
  'prior DNS',
  'seed job logs',
];

const evidenceSnippets = [
  'Cloud Build logs',
  'approval records',
  'one Cloud Build run per environment deployment',
  'same commit SHA',
  'parallel service rollout',
  'migration job logs',
  'seed job logs',
  'Cloud Run revision history',
  'secret rotation',
  'DNS cutover',
  'least privilege',
  'environment separation',
  'database-migrations-main.yml',
  'database-migrations-release.yml',
];

function assertIncludes({ source, snippets, label }) {
  const normalizedSource = source.toLowerCase();
  for (const snippet of snippets) {
    if (!normalizedSource.includes(snippet.toLowerCase())) {
      throw new Error(`${label} is missing: ${snippet}`);
    }
  }
}

assertIncludes({
  source: edge,
  snippets: edgeSnippets,
  label: 'managed edge cutover runbook',
});
assertIncludes({
  source: evidence,
  snippets: evidenceSnippets,
  label: 'ISO evidence runbook',
});

console.log('Deployment cutover and ISO evidence runbooks cover required controls.');
