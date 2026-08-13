import { describe, expect, it } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const workflowsDirectory = join(process.cwd(), '.github/workflows');

describe('Trigger.dev deployment topology', () => {
  it('keeps exactly one consolidated staging deployment on develop', () => {
    const deployWorkflows = readdirSync(workflowsDirectory)
      .filter((file) => file.endsWith('.yml'))
      .map((file) => ({
        file,
        contents: readFileSync(join(workflowsDirectory, file), 'utf8'),
      }))
      .filter(({ contents }) => contents.includes('trigger.dev@') && contents.includes(' deploy'));

    const stagingWorkflows = deployWorkflows.filter(({ contents }) =>
      contents.includes('deploy --env staging'),
    );

    expect(stagingWorkflows).toHaveLength(1);
    expect(stagingWorkflows[0]?.file).toBe('trigger-tasks-deploy-main.yml');
    expect(stagingWorkflows[0]?.contents).toContain('branches:\n      - develop');
    expect(stagingWorkflows[0]?.contents).toContain('working-directory: ./apps/app');
    expect(stagingWorkflows[0]?.contents).toContain('trigger.dev@4.5.9');

    for (const workflow of deployWorkflows) {
      expect(workflow.contents).toContain('working-directory: ./apps/app');
      expect(workflow.contents).not.toContain('working-directory: ./apps/api');
    }

    expect(deployWorkflows).toHaveLength(2);
    expect(deployWorkflows.map(({ file }) => file).sort()).toEqual([
      'trigger-tasks-deploy-main.yml',
      'trigger-tasks-deploy-release.yml',
    ]);

    const productionWorkflow = deployWorkflows.find(({ file }) =>
      file === 'trigger-tasks-deploy-release.yml',
    );
    expect(productionWorkflow?.contents).toContain('branches:\n      - release');
    expect(productionWorkflow?.contents).toMatch(/trigger\.dev@4\.5\.9 deploy\s*$/m);
    expect(productionWorkflow?.contents).not.toContain('--env staging');

    const config = readFileSync(join(process.cwd(), 'apps/app/trigger.config.ts'), 'utf8');
    expect(config).toContain("'../api/src/trigger/tasks'");
    expect(config).toContain("dirs: ['./src/jobs', './src/trigger', '../api/src/trigger/tasks']");
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
