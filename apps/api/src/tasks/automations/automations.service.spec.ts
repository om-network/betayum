import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { db } from '@db';
import { AutomationAuditService } from './automation-audit.service';
import { AutomationRuntimeService } from './automation-runtime.service';
import { AutomationSecretsService } from './automation-secrets.service';
import { AutomationUsageLimitsService } from './automation-usage-limits.service';
import { AutomationsService } from './automations.service';

jest.mock('@db', () => ({
  db: {
    evidenceAutomation: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    evidenceAutomationRun: {
      findMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    evidenceAutomationVersion: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    task: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    secret: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

const mockedDb = db as unknown as {
  evidenceAutomation: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  evidenceAutomationRun: {
    findMany: jest.Mock;
    create: jest.Mock;
    count: jest.Mock;
  };
  evidenceAutomationVersion: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    count: jest.Mock;
  };
  task: {
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  secret: {
    findMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

describe('AutomationsService', () => {
  let service: AutomationsService;
  const runtimeService = {
    assertExecutionAvailable: jest.fn(),
    buildExecutionRequest: jest.fn(),
  };
  const usageLimitsService = {
    assertManualRunLimit: jest.fn(),
    assertVersionLimit: jest.fn(),
  };
  const secretsService = {
    verifySecretRefs: jest.fn(),
  };
  const auditService = {
    logAutomationEvent: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    runtimeService.buildExecutionRequest.mockImplementation((input) => input);
    usageLimitsService.assertManualRunLimit.mockResolvedValue(undefined);
    usageLimitsService.assertVersionLimit.mockResolvedValue(undefined);
    secretsService.verifySecretRefs.mockResolvedValue(undefined);
    auditService.logAutomationEvent.mockResolvedValue(undefined);
    service = new AutomationsService(
      runtimeService as unknown as AutomationRuntimeService,
      usageLimitsService as unknown as AutomationUsageLimitsService,
      secretsService as unknown as AutomationSecretsService,
      auditService as unknown as AutomationAuditService,
    );
  });

  it('lists automations only for the requested task and organization', async () => {
    mockedDb.evidenceAutomation.findMany.mockResolvedValue([]);

    await service.findByTaskId({
      organizationId: 'org_1',
      taskId: 'tsk_1',
    });

    expect(mockedDb.evidenceAutomation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          taskId: 'tsk_1',
          task: { organizationId: 'org_1' },
        },
      }),
    );
  });

  it('does not return automation details across organization boundaries', async () => {
    mockedDb.evidenceAutomation.findFirst.mockResolvedValue(null);

    await expect(
      service.findById({
        organizationId: 'org_1',
        taskId: 'tsk_1',
        automationId: 'aut_1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(mockedDb.evidenceAutomation.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'aut_1',
        taskId: 'tsk_1',
        task: { organizationId: 'org_1' },
      },
    });
  });

  it('updates only automations scoped to the requested task and organization', async () => {
    mockedDb.evidenceAutomation.findFirst.mockResolvedValue({
      id: 'aut_1',
    } as never);
    mockedDb.evidenceAutomation.update.mockResolvedValue({
      id: 'aut_1',
      name: 'Updated',
      description: 'Updated description',
    } as never);

    await service.update({
      organizationId: 'org_1',
      taskId: 'tsk_1',
      automationId: 'aut_1',
      data: { name: 'Updated' },
    });

    expect(mockedDb.evidenceAutomation.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'aut_1',
        taskId: 'tsk_1',
        task: { organizationId: 'org_1' },
      },
    });
    expect(mockedDb.evidenceAutomation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'aut_1' },
        data: { name: 'Updated' },
      }),
    );
  });

  it('deletes only automations scoped to the requested task and organization', async () => {
    mockedDb.evidenceAutomation.findFirst.mockResolvedValue({
      id: 'aut_1',
    } as never);

    await service.delete({
      organizationId: 'org_1',
      taskId: 'tsk_1',
      automationId: 'aut_1',
    });

    expect(mockedDb.evidenceAutomation.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'aut_1',
        taskId: 'tsk_1',
        task: { organizationId: 'org_1' },
      },
    });
    expect(mockedDb.evidenceAutomation.delete).toHaveBeenCalledWith({
      where: { id: 'aut_1' },
    });
  });

  it('publishes the next immutable automation version for the scoped automation', async () => {
    mockedDb.evidenceAutomation.findFirst.mockResolvedValue({
      id: 'aut_1',
    } as never);
    mockedDb.evidenceAutomationVersion.findFirst.mockResolvedValue({
      version: 2,
    } as never);
    mockedDb.evidenceAutomationVersion.create.mockReturnValue({
      id: 'eav_3',
      version: 3,
    } as never);
    mockedDb.evidenceAutomation.update.mockReturnValue({
      id: 'aut_1',
    } as never);
    mockedDb.$transaction.mockResolvedValue([
      { id: 'eav_3', version: 3 },
      { id: 'aut_1' },
    ] as never);

    const result = await service.createVersion({
      organizationId: 'org_1',
      taskId: 'tsk_1',
      automationId: 'aut_1',
      data: {
        scriptKey: 'org_1/tasks/tsk_1/automations/aut_1/v3.js',
        changelog: 'Publish stable automation',
      },
    });

    expect(usageLimitsService.assertVersionLimit).toHaveBeenCalledWith({
      organizationId: 'org_1',
      taskId: 'tsk_1',
      automationId: 'aut_1',
    });
    expect(mockedDb.evidenceAutomationVersion.findFirst).toHaveBeenCalledWith({
      where: {
        evidenceAutomationId: 'aut_1',
        evidenceAutomation: {
          taskId: 'tsk_1',
          task: { organizationId: 'org_1' },
        },
      },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    expect(mockedDb.evidenceAutomationVersion.create).toHaveBeenCalledWith({
      data: {
        evidenceAutomationId: 'aut_1',
        version: 3,
        scriptKey: 'org_1/tasks/tsk_1/automations/aut_1/v3.js',
        changelog: 'Publish stable automation',
      },
    });
    expect(result).toEqual({
      success: true,
      version: { id: 'eav_3', version: 3 },
    });
  });

  it('restores a prior version as a draft reference without mutating it', async () => {
    mockedDb.evidenceAutomation.findFirst.mockResolvedValue({
      id: 'aut_1',
    } as never);
    mockedDb.evidenceAutomationVersion.findFirst.mockResolvedValue({
      id: 'eav_1',
      version: 1,
      scriptKey: 'org_1/tasks/tsk_1/automations/aut_1/v1.js',
      changelog: 'Initial version',
    } as never);

    const result = await service.restoreVersion({
      organizationId: 'org_1',
      taskId: 'tsk_1',
      automationId: 'aut_1',
      version: 1,
    });

    expect(mockedDb.evidenceAutomationVersion.findFirst).toHaveBeenCalledWith({
      where: {
        evidenceAutomationId: 'aut_1',
        version: 1,
        evidenceAutomation: {
          taskId: 'tsk_1',
          task: { organizationId: 'org_1' },
        },
      },
    });
    expect(mockedDb.evidenceAutomationVersion.create).not.toHaveBeenCalled();
    expect(mockedDb.evidenceAutomation.update).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      draft: {
        automationId: 'aut_1',
        restoredFromVersion: 1,
        scriptKey: 'org_1/tasks/tsk_1/automations/aut_1/v1.js',
      },
    });
  });

  it('starts a manual run pinned to a published version through the runtime contract', async () => {
    mockedDb.evidenceAutomation.findFirst.mockResolvedValue({
      id: 'aut_1',
    } as never);
    mockedDb.evidenceAutomationVersion.findFirst.mockResolvedValue({
      id: 'eav_2',
      version: 2,
      scriptKey: 'org_1/tasks/tsk_1/automations/aut_1/v2.js',
    } as never);
    mockedDb.evidenceAutomationRun.create.mockResolvedValue({
      id: 'ear_1',
      status: 'pending',
      version: 2,
    } as never);
    const result = await service.startManualRun({
      organizationId: 'org_1',
      taskId: 'tsk_1',
      automationId: 'aut_1',
      version: 2,
      secretRefs: [{ name: 'github-token', category: 'automation' }],
      actor: { userId: 'usr_1', memberId: 'mem_1' },
    });

    expect(runtimeService.assertExecutionAvailable).toHaveBeenCalled();
    expect(usageLimitsService.assertManualRunLimit).toHaveBeenCalledWith({
      organizationId: 'org_1',
    });
    expect(secretsService.verifySecretRefs).toHaveBeenCalledWith({
      organizationId: 'org_1',
      secretRefs: [{ name: 'github-token', category: 'automation' }],
    });
    expect(mockedDb.evidenceAutomationRun.create).toHaveBeenCalledWith({
      data: {
        evidenceAutomationId: 'aut_1',
        taskId: 'tsk_1',
        triggeredBy: 'manual',
        status: 'pending',
        version: 2,
      },
    });
    expect(mockedDb.task.update).not.toHaveBeenCalled();
    expect(auditService.logAutomationEvent).toHaveBeenCalledWith({
      actor: { userId: 'usr_1', memberId: 'mem_1' },
      organizationId: 'org_1',
      taskId: 'tsk_1',
      automationId: 'aut_1',
      action: 'manual_run_started',
      description: 'started automation run v2',
      runId: 'ear_1',
      version: 2,
    });
    expect(auditService.logAutomationEvent).toHaveBeenCalledWith({
      actor: { userId: 'usr_1', memberId: 'mem_1' },
      organizationId: 'org_1',
      taskId: 'tsk_1',
      automationId: 'aut_1',
      action: 'secret_refs_used',
      description: 'used automation secret references',
      runId: 'ear_1',
      version: 2,
      secretRefs: [{ name: 'github-token', category: 'automation' }],
    });
    expect(runtimeService.buildExecutionRequest).toHaveBeenCalledWith({
      organizationId: 'org_1',
      taskId: 'tsk_1',
      automationId: 'aut_1',
      runId: 'ear_1',
      version: 2,
      artifactKey: 'org_1/tasks/tsk_1/automations/aut_1/v2.js',
      trigger: 'manual',
      secretRefs: [{ name: 'github-token', category: 'automation' }],
      tools: [],
    });
    expect(result).toEqual({
      success: true,
      run: { id: 'ear_1', status: 'pending', version: 2 },
      workerRequest: {
        organizationId: 'org_1',
        taskId: 'tsk_1',
        automationId: 'aut_1',
        runId: 'ear_1',
        version: 2,
        artifactKey: 'org_1/tasks/tsk_1/automations/aut_1/v2.js',
        trigger: 'manual',
        secretRefs: [{ name: 'github-token', category: 'automation' }],
        tools: [],
      },
    });
  });

  it('rejects manual runs that reference secrets outside the organization', async () => {
    mockedDb.evidenceAutomation.findFirst.mockResolvedValue({
      id: 'aut_1',
    } as never);
    mockedDb.evidenceAutomationVersion.findFirst.mockResolvedValue({
      id: 'eav_2',
      version: 2,
      scriptKey: 'org_1/tasks/tsk_1/automations/aut_1/v2.js',
    } as never);
    secretsService.verifySecretRefs.mockRejectedValue(
      new NotFoundException('Automation secret not found'),
    );

    await expect(
      service.startManualRun({
        organizationId: 'org_1',
        taskId: 'tsk_1',
        automationId: 'aut_1',
        version: 2,
        secretRefs: [{ name: 'other-org-token', category: 'automation' }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(mockedDb.evidenceAutomationRun.create).not.toHaveBeenCalled();
  });

  it('enforces the organization manual run limit before creating a run', async () => {
    mockedDb.evidenceAutomation.findFirst.mockResolvedValue({
      id: 'aut_1',
    } as never);
    mockedDb.evidenceAutomationVersion.findFirst.mockResolvedValue({
      id: 'eav_2',
      version: 2,
      scriptKey: 'org_1/tasks/tsk_1/automations/aut_1/v2.js',
    } as never);
    usageLimitsService.assertManualRunLimit.mockRejectedValue(
      new HttpException(
        'Task automation manual run limit reached',
        HttpStatus.TOO_MANY_REQUESTS,
      ),
    );

    await expect(
      service.startManualRun({
        organizationId: 'org_1',
        taskId: 'tsk_1',
        automationId: 'aut_1',
        version: 2,
      }),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });

    expect(mockedDb.evidenceAutomationRun.create).not.toHaveBeenCalled();
  });

  it('enforces the stored version limit before publishing', async () => {
    mockedDb.evidenceAutomation.findFirst.mockResolvedValue({
      id: 'aut_1',
    } as never);
    usageLimitsService.assertVersionLimit.mockRejectedValue(
      new HttpException(
        'Task automation version limit reached',
        HttpStatus.TOO_MANY_REQUESTS,
      ),
    );

    await expect(
      service.createVersion({
        organizationId: 'org_1',
        taskId: 'tsk_1',
        automationId: 'aut_1',
        data: {
          scriptKey: 'org_1/tasks/tsk_1/automations/aut_1/v3.js',
        },
      }),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });

    expect(mockedDb.evidenceAutomationVersion.create).not.toHaveBeenCalled();
  });
});
