import { NotFoundException } from '@nestjs/common';
import { db } from '@db';
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
    },
    evidenceAutomationVersion: {
      findMany: jest.fn(),
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

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AutomationsService();
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
});
