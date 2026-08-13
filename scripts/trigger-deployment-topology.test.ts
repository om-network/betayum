import { describe, expect, it } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const workflowsDirectory = join(process.cwd(), '.github/workflows');

describe('Trigger.dev deployment topology', () => {
  it('deploys the shared Trigger.dev project only from the unified app configuration', () => {
    const deployWorkflows = readdirSync(workflowsDirectory)
      .filter((file) => file.endsWith('.yml'))
      .map((file) => ({
        file,
        contents: readFileSync(join(workflowsDirectory, file), 'utf8'),
      }))
      .filter(({ contents }) => contents.includes('trigger.dev@') && contents.includes(' deploy'));

    expect(deployWorkflows.length).toBeGreaterThan(0);
    for (const workflow of deployWorkflows) {
      expect(workflow.contents).toContain('working-directory: ./apps/app');
      expect(workflow.contents).not.toContain('working-directory: ./apps/api');
    }

    const config = readFileSync(join(process.cwd(), 'apps/app/trigger.config.ts'), 'utf8');
    expect(config).toContain("'../api/src/trigger/tasks'");
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
