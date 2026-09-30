import { describe, expect, it } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const workflowsDirectory = join(process.cwd(), '.github/workflows');

describe('Trigger.dev deployment topology', () => {
  it('deploys the consolidated task project through Cloud Build', () => {
    const deployWorkflows = readdirSync(workflowsDirectory)
      .filter((file) => file.endsWith('.yml'))
      .map((file) => ({
        file,
        contents: readFileSync(join(workflowsDirectory, file), 'utf8'),
      }))
      .filter(({ contents }) => contents.includes('trigger.dev@') && contents.includes(' deploy'));

    expect(deployWorkflows).toHaveLength(0);

    const cloudbuild = readFileSync(join(process.cwd(), 'cloudbuild.yaml'), 'utf8');
    expect(cloudbuild).toContain('id: deploy-trigger-tasks');
    expect(cloudbuild).toContain('scripts/deploy-trigger-tasks-gce.sh');
    expect(cloudbuild).toContain('TRIGGER_API_URL=${_TRIGGER_URL}');

    const config = readFileSync(join(process.cwd(), 'apps/app/trigger.config.ts'), 'utf8');
    expect(config).toContain("'../api/src/trigger/tasks'");
    expect(config).toContain("dirs: ['./src/jobs', './src/trigger', '../api/src/trigger/tasks']");
    expect(config).toContain('syncEnvVars(');
    expect(readdirSync(workflowsDirectory)).not.toContain('database-migrations-main.yml');

    const apiDeployWorkflows = readdirSync(workflowsDirectory).filter((file) =>
      /trigger.*deploy.*api|api.*deploy.*trigger/i.test(file),
    );
    expect(apiDeployWorkflows).toHaveLength(0);
  });

  it('starts only one local Trigger.dev worker', () => {
    const apiPackage = JSON.parse(
      readFileSync(join(process.cwd(), 'apps/api/package.json'), 'utf8'),
    ) as { scripts: { dev: string } };
    const appPackage = JSON.parse(
      readFileSync(join(process.cwd(), 'apps/app/package.json'), 'utf8'),
    ) as { scripts: { dev: string } };

    expect(apiPackage.scripts.dev).not.toContain('trigger dev');
    expect(appPackage.scripts.dev).toContain('trigger dev');
  });
});
