import { db } from '@db';
import { AutomationAuditService } from './automation-audit.service';

jest.mock('@db', () => ({
  db: {
    auditLog: {
      create: jest.fn(),
    },
  },
}));

const mockedDb = db as unknown as {
  auditLog: {
    create: jest.Mock;
  };
};

describe('AutomationAuditService', () => {
  let service: AutomationAuditService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AutomationAuditService();
  });

  it('records task-scoped automation activity with an automation path', async () => {
    await service.logAutomationEvent({
      organizationId: 'org_1',
      taskId: 'tsk_1',
      automationId: 'aut_1',
      actor: { userId: 'usr_1', memberId: 'mem_1' },
      action: 'manual_run_started',
      description: 'started automation run',
      runId: 'ear_1',
      version: 2,
      secretRefs: [{ name: 'github-token', category: 'automation' }],
    });

    expect(mockedDb.auditLog.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org_1',
        userId: 'usr_1',
        memberId: 'mem_1',
        entityType: 'task',
        entityId: 'tsk_1',
        description: 'started automation run',
        data: {
          action: 'manual_run_started',
          automationId: 'aut_1',
          taskId: 'tsk_1',
          path: '/tasks/tsk_1/automations/aut_1',
          runId: 'ear_1',
          version: 2,
          secretRefs: ['github-token'],
        },
      },
    });
  });
});
