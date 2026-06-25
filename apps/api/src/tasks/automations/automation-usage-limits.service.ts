import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { db } from '@db';
import type { ScopedAutomationParams } from './automation-types';

@Injectable()
export class AutomationUsageLimitsService {
  async assertManualRunLimit({ organizationId }: { organizationId: string }) {
    const limit = this.getPositiveIntegerEnv({
      name: 'TASK_AUTOMATION_MANUAL_RUNS_PER_DAY',
      fallback: 100,
    });
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const runCount = await db.evidenceAutomationRun.count({
      where: {
        createdAt: { gte: since },
        evidenceAutomation: {
          task: { organizationId },
        },
      },
    });

    if (runCount < limit) {
      return;
    }

    throw new HttpException(
      'Task automation manual run limit reached',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  async assertVersionLimit({
    organizationId,
    taskId,
    automationId,
  }: ScopedAutomationParams) {
    const limit = this.getPositiveIntegerEnv({
      name: 'TASK_AUTOMATION_MAX_VERSIONS_PER_AUTOMATION',
      fallback: 50,
    });
    const versionCount = await db.evidenceAutomationVersion.count({
      where: {
        evidenceAutomationId: automationId,
        evidenceAutomation: {
          taskId,
          task: { organizationId },
        },
      },
    });

    if (versionCount < limit) {
      return;
    }

    throw new HttpException(
      'Task automation version limit reached',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private getPositiveIntegerEnv({
    name,
    fallback,
  }: {
    name: string;
    fallback: number;
  }) {
    const parsed = Number.parseInt(process.env[name] ?? '', 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }

    return fallback;
  }
}
