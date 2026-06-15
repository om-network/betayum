import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();

const migratedTargets = [
  '.github/workflows/device-agent-release.yml',
  'apps/api/src/app/object-storage.ts',
  'apps/api/src/attachments',
  'apps/api/src/browserbase',
  'apps/api/src/device-agent',
  'apps/api/src/knowledge-base',
  'apps/api/src/organization/organization.service.ts',
  'apps/api/src/policies',
  'apps/api/src/questionnaire',
  'apps/api/src/tasks/evidence-export',
  'apps/api/src/trigger/questionnaire',
  'apps/api/src/trigger/vector-store',
  'apps/api/src/trust-portal',
  'apps/api/src/vector-store/lib/sync',
];

const envTargets = ['.env.example', 'apps/api/.env.example'];

const forbiddenRuntimePatterns = [
  /@aws-sdk\/client-s3/,
  /@aws-sdk\/s3-request-presigner/,
  /\bAPP_AWS_[A-Z0-9_]*\b/,
  /\bAWS_ACCESS_KEY_ID\b/,
  /\bAWS_SECRET_ACCESS_KEY\b/,
  /\baws s3\b/,
  /\bs3:\/\//,
  /\bs3Client\b/,
  /\bcreateStorageClient\b/,
];

const forbiddenEnvPatterns = [
  /\bAPP_AWS_[A-Z0-9_]*\b/,
  /\bAWS_ACCESS_KEY_ID\b/,
  /\bAWS_SECRET_ACCESS_KEY\b/,
  /S3 interoperability/i,
  /Legacy AWS S3/i,
];

function listFiles(target) {
  const absoluteTarget = join(root, target);
  const stat = statSync(absoluteTarget);
  if (stat.isFile()) {
    return [target];
  }

  const output = execFileSync('git', ['ls-files', target], {
    cwd: root,
    encoding: 'utf8',
  });

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) => !/\.(spec|test)\.(ts|tsx|js|mjs)$/.test(file))
    .filter((file) => /\.(ts|tsx|js|mjs|yml|yaml)$/.test(file));
}

function findViolations(files, patterns) {
  const violations = [];

  for (const file of files) {
    const content = readFileSync(join(root, file), 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      if (
        file === 'apps/api/src/app/object-storage.ts' &&
        /\bAPP_AWS_[A-Z0-9_]*\b/.test(line)
      ) {
        return;
      }

      for (const pattern of patterns) {
        if (pattern.test(line)) {
          violations.push(`${file}:${index + 1}: ${line.trim()}`);
          break;
        }
      }
    });
  }

  return violations;
}

const runtimeFiles = migratedTargets.flatMap(listFiles);
const envFiles = envTargets.flatMap(listFiles);
const violations = [
  ...findViolations(runtimeFiles, forbiddenRuntimePatterns),
  ...findViolations(envFiles, forbiddenEnvPatterns),
];

if (violations.length > 0) {
  console.error('First-party object storage guardrail failed.');
  console.error(
    'Use apps/api/src/app/object-storage.ts and GCS/ADC bucket variables. Customer AWS cloud-security code is intentionally outside this check.',
  );
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Object storage guardrails passed.');
