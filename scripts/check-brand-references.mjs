import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const legacyPattern = /(Comp AI|CompAI|trycomp\.ai|Comp&#0032;AI)/;

const ignoredDirectories = new Set([
  '.git',
  '.next',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'release',
]);

const ignoredFileExtensions = new Set([
  '.avif',
  '.dmg',
  '.gif',
  '.ico',
  '.jpg',
  '.jpeg',
  '.pdf',
  '.png',
  '.webp',
  '.zip',
]);

const allowlist = [
  {
    reason: 'scanner owns the legacy-token patterns',
    file: /^scripts\/check-brand-references\.mjs$/,
  },
  {
    reason: 'legacy inventory documents intentional compatibility identifiers',
    file: /^docs\/rebrand\/legacy-brand-inventory\.md$/,
  },
  {
    reason: 'AWS and device-agent compatibility identifiers must remain stable',
    line:
      /CompAI-(Auditor|Remediator|AutoFix|Device-Agent|CostExplorer|ExtraReadAccess|StorageRemediation|ComputeRemediation|NetworkRemediation|SecurityRemediation|MessagingRemediation|ExtendedRemediation|Rollback|BatchPermissions|CIS-Metrics|CIS-Alerts|Integration|\{Service\}Delivery|CloudTrailDelivery)/,
  },
  {
    reason: 'legacy installer artifact names must remain stable',
    line: /Comp AI Agent-/,
  },
  {
    reason: 'legacy local device-agent paths must remain stable',
    line: /CompAI\\+Fleet/,
  },
  {
    reason: 'legacy trycomp redirect hosts are accepted during migration',
    file: /^apps\/api\/src\/billing\/billing-redirect-urls(\.spec)?\.ts$/,
    line: /trycomp\.ai/,
  },
  {
    reason: 'tests assert old brand strings are absent from rendered emails',
    file: /^packages\/email\/emails\/render\.test\.tsx$/,
    line: /not\.toContain\('(Comp AI|trycomp\.ai)'\)/,
  },
  {
    reason: 'historical migration records the original default',
    file:
      /^packages\/db\/prisma\/migrations\/20251125182239_add_prepared_by_approved_by_to_soa_document\/migration\.sql$/,
  },
  {
    reason: 'tests and access rules preserve internal legacy email-domain behavior',
    file:
      /^(apps\/api\/src\/(stripe\/domain\.utils\.spec|organization-access\/organization-access\.(controller|service|service\.spec))|apps\/app\/src\/app\/\(app\)\/(onboarding|setup|upgrade)\/)/,
    line: /trycomp\.ai/,
  },
  {
    reason: 'background-check and pentest specs use legacy fixture URLs/emails',
    file:
      /^apps\/api\/src\/(background-checks\/.*\.spec|security-penetration-tests\/.*\.spec)\.ts$/,
    line: /trycomp\.ai/,
  },
  {
    reason: 'frontend background-check specs use legacy fixture URLs/copy',
    file:
      /^apps\/app\/src\/app\/\(app\)\/\[orgId\]\/people\/\[employeeId\]\/components\/(BackgroundCheckStatusView|EmployeeBackgroundCheck)\.test\.tsx$/,
  },
  {
    reason: 'tracking README names the legacy production analytics host',
    file: /^apps\/app\/src\/components\/tracking\/README\.md$/,
    line: /app\.trycomp\.ai/,
  },
  {
    reason: 'permission tests cover historical custom-role names',
    file: /^apps\/app\/src\/lib\/permissions\.test\.ts$/,
    line: /CompAI/,
  },
  {
    reason: 'editor content validation test uses legacy sample policy text',
    file: /^packages\/ui\/src\/components\/editor\/utils\/validate-content\.test\.ts$/,
    line: /Comp AI/,
  },
];

function isAllowed({ file, line }) {
  return allowlist.some((entry) => {
    const fileMatches = entry.file ? entry.file.test(file) : true;
    const lineMatches = entry.line ? entry.line.test(line) : true;
    return fileMatches && lineMatches;
  });
}

function shouldSkipFile(path) {
  return [...ignoredFileExtensions].some((extension) => path.endsWith(extension));
}

function walk(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(...walk(path));
      }
      continue;
    }

    if (entry.isFile() && !shouldSkipFile(path)) {
      files.push(path);
    }
  }

  return files;
}

const violations = [];

for (const path of walk(root)) {
  if (statSync(path).size > 5 * 1024 * 1024) {
    continue;
  }

  const file = relative(root, path);
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);

  lines.forEach((line, index) => {
    if (!legacyPattern.test(line)) {
      return;
    }

    if (!isAllowed({ file, line })) {
      violations.push(`${file}:${index + 1}: ${line.trim()}`);
    }
  });
}

if (violations.length > 0) {
  console.error('Unexpected legacy brand references found:');
  for (const violation of violations.slice(0, 80)) {
    console.error(`  ${violation}`);
  }
  if (violations.length > 80) {
    console.error(`  ...and ${violations.length - 80} more`);
  }
  process.exit(1);
}

console.log('Brand reference check passed.');
