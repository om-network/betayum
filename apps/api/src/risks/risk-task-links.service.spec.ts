import { BadRequestException, NotFoundException } from '@nestjs/common';
import { db } from '@db';
import { RiskTaskLinksService } from './risk-task-links.service';

jest.mock('@db', () => ({
  db: {
    risk: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    task: {
      findMany: jest.fn(),
    },
  },
}));

type MockDbCall = jest.MockedFunction<(args: unknown) => Promise<unknown>>;

const riskFindFirst = db.risk.findFirst as unknown as MockDbCall;
const riskUpdate = db.risk.update as unknown as MockDbCall;
const taskFindMany = db.task.findMany as unknown as MockDbCall;

describe('RiskTaskLinksService', () => {
  let service: RiskTaskLinksService;

  beforeEach(() => {
    service = new RiskTaskLinksService();
    jest.clearAllMocks();
  });

  describe('applyTaskLinks', () => {
    it('replaces links after validating risk and task tenancy', async () => {
      riskFindFirst.mockResolvedValue({ id: 'risk_1' });
      taskFindMany.mockResolvedValue([{ id: 'task_1' }, { id: 'task_2' }]);
      riskUpdate.mockResolvedValue({ id: 'risk_1' });

      const result = await service.applyTaskLinks({
        riskId: 'risk_1',
        organizationId: 'org_1',
        taskIds: ['task_1', 'task_2'],
        replace: true,
      });

      expect(result).toEqual({ linked: 2 });
      expect(riskFindFirst).toHaveBeenCalledWith({
        where: { id: 'risk_1', organizationId: 'org_1' },
        select: { id: true },
      });
      expect(taskFindMany).toHaveBeenCalledWith({
        where: { id: { in: ['task_1', 'task_2'] }, organizationId: 'org_1' },
        select: { id: true },
      });
      expect(riskUpdate).toHaveBeenCalledWith({
        where: { id: 'risk_1' },
        data: {
          tasks: { set: [{ id: 'task_1' }, { id: 'task_2' }] },
          autoLinkRunId: null,
          autoLinkRunStartedAt: null,
        },
      });
    });

    it('connects links additively by default', async () => {
      riskFindFirst.mockResolvedValue({ id: 'risk_1' });
      taskFindMany.mockResolvedValue([{ id: 'task_1' }]);
      riskUpdate.mockResolvedValue({ id: 'risk_1' });

      await service.applyTaskLinks({
        riskId: 'risk_1',
        organizationId: 'org_1',
        taskIds: ['task_1'],
      });

      expect(riskUpdate).toHaveBeenCalledWith({
        where: { id: 'risk_1' },
        data: {
          tasks: { connect: [{ id: 'task_1' }] },
          autoLinkRunId: null,
          autoLinkRunStartedAt: null,
        },
      });
    });

    it('rejects tasks outside the organization', async () => {
      riskFindFirst.mockResolvedValue({ id: 'risk_1' });
      taskFindMany.mockResolvedValue([{ id: 'task_1' }]);

      await expect(
        service.applyTaskLinks({
          riskId: 'risk_1',
          organizationId: 'org_1',
          taskIds: ['task_1', 'task_other_org'],
        }),
      ).rejects.toThrow(BadRequestException);

      expect(riskUpdate).not.toHaveBeenCalled();
    });

    it('returns 404 for a risk outside the organization', async () => {
      riskFindFirst.mockResolvedValue(null);

      await expect(
        service.applyTaskLinks({
          riskId: 'risk_1',
          organizationId: 'org_1',
          taskIds: [],
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('unlinkTask', () => {
    it('disconnects an existing task link scoped to the organization', async () => {
      riskFindFirst.mockResolvedValue({
        id: 'risk_1',
        tasks: [{ id: 'task_1' }],
      });
      riskUpdate.mockResolvedValue({ id: 'risk_1' });

      const result = await service.unlinkTask({
        riskId: 'risk_1',
        taskId: 'task_1',
        organizationId: 'org_1',
      });

      expect(result).toEqual({ ok: true });
      expect(riskFindFirst).toHaveBeenCalledWith({
        where: { id: 'risk_1', organizationId: 'org_1' },
        select: {
          id: true,
          tasks: { where: { id: 'task_1' }, select: { id: true } },
        },
      });
      expect(riskUpdate).toHaveBeenCalledWith({
        where: { id: 'risk_1' },
        data: { tasks: { disconnect: { id: 'task_1' } } },
      });
    });

    it('returns 404 when the task is not linked', async () => {
      riskFindFirst.mockResolvedValue({ id: 'risk_1', tasks: [] });

      await expect(
        service.unlinkTask({
          riskId: 'risk_1',
          taskId: 'task_1',
          organizationId: 'org_1',
        }),
      ).rejects.toThrow(NotFoundException);

      expect(riskUpdate).not.toHaveBeenCalled();
    });
  });
});
