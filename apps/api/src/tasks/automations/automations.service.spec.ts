import { NotFoundException } from '@nestjs/common';
import { db } from '@db';
import { AutomationRuntimeService } from './automation-runtime.service';
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
    },
    evidenceAutomationVersion: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    task: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

const mockedDb = db as jest.Mocked<typeof db>;

describe('AutomationsService', () => {
  let service: AutomationsService;
  const runtimeService = {
    assertExecutionAvailable: jest.fn(),
    buildExecutionRequest: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    runtimeService.buildExecutionRequest.mockImplementation((input) => input);
    service = new AutomationsService(
      runtimeService as unknown as AutomationRuntimeService,
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
    mockedDb.evidenceAutomation.update.mockReturnValue({ id: 'aut_1' } as never);
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
    });

    expect(runtimeService.assertExecutionAvailable).toHaveBeenCalled();
    expect(mockedDb.evidenceAutomationRun.create).toHaveBeenCalledWith({
      data: {
        evidenceAutomationId: 'aut_1',
        taskId: 'tsk_1',
        triggeredBy: 'manual',
        status: 'pending',
        version: 2,
      },
    });
    expect(runtimeService.buildExecutionRequest).toHaveBeenCalledWith({
      organizationId: 'org_1',
      taskId: 'tsk_1',
      automationId: 'aut_1',
      runId: 'ear_1',
      version: 2,
      artifactKey: 'org_1/tasks/tsk_1/automations/aut_1/v2.js',
      trigger: 'manual',
      secretRefs: [],
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
        secretRefs: [],
        tools: [],
      },
    });
  });
});
