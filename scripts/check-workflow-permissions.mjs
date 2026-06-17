import { readFileSync } from 'node:fs';

const workflowPaths = [
  '.github/workflows/database-migrations-main.yml',
  '.github/workflows/database-migrations-release.yml',
  '.github/workflows/trigger-tasks-deploy-main.yml',
  '.github/workflows/trigger-tasks-deploy-release.yml',
];

function fail(message) {
  console.error(`workflow permissions check failed: ${message}`);
  process.exitCode = 1;
}

function hasReadOnlyContentsPermission(workflow) {
  return /^permissions:\n(?:  .+\n)*  contents: read\n/m.test(workflow);
}

for (const workflowPath of workflowPaths) {
  const workflow = readFileSync(workflowPath, 'utf8');

  if (!hasReadOnlyContentsPermission(workflow)) {
    fail(`${workflowPath} must declare permissions.contents: read`);
  }
}

if (process.exitCode !== 1) {
  console.log('workflow permissions are explicitly least-privilege');
}
