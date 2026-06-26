import { HttpStatus } from '@nestjs/common';
import { db } from '@db';
import { AutomationUsageLimitsService } from './automation-usage-limits.service';

jest.mock('@db', () => ({
  db: {
    evidenceAutomationRun: {
      count: jest.fn(),
    },
    evidenceAutomationVersion: {
      count: jest.fn(),
    },
  },
}));

const mockedDb = db as unknown as {
  evidenceAutomationRun: {
    count: jest.Mock;
  };
  evidenceAutomationVersion: {
    count: jest.Mock;
  };
};

describe('AutomationUsageLimitsService', () => {
  const originalEnv = process.env;
  let service: AutomationUsageLimitsService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    service = new AutomationUsageLimitsService();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('enforces organization manual run limits over the trailing day', async () => {
    process.env.TASK_AUTOMATION_MANUAL_RUNS_PER_DAY = '1';
    mockedDb.evidenceAutomationRun.count.mockResolvedValue(1);

    await expect(
      service.assertManualRunLimit({ organizationId: 'org_1' }),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });

    expect(mockedDb.evidenceAutomationRun.count).toHaveBeenCalledWith({
      where: {
        createdAt: { gte: expect.any(Date) },
        triggeredBy: 'manual',
        evidenceAutomation: {
          task: { organizationId: 'org_1' },
        },
      },
    });
  });

  it('enforces stored version limits for a scoped automation', async () => {
    process.env.TASK_AUTOMATION_MAX_VERSIONS_PER_AUTOMATION = '2';
    mockedDb.evidenceAutomationVersion.count.mockResolvedValue(2);

    await expect(
      service.assertVersionLimit({
        organizationId: 'org_1',
        taskId: 'tsk_1',
        automationId: 'aut_1',
      }),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });

    expect(mockedDb.evidenceAutomationVersion.count).toHaveBeenCalledWith({
      where: {
        evidenceAutomationId: 'aut_1',
        evidenceAutomation: {
          taskId: 'tsk_1',
          task: { organizationId: 'org_1' },
        },
      },
    });
  });
});
