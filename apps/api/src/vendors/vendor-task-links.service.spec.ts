import { BadRequestException, NotFoundException } from '@nestjs/common';
import { db } from '@db';
import { VendorTaskLinksService } from './vendor-task-links.service';

jest.mock('@db', () => ({
  db: {
    vendor: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    task: {
      findMany: jest.fn(),
    },
  },
}));

type MockDbCall = jest.MockedFunction<(args: unknown) => Promise<unknown>>;

const vendorFindFirst = db.vendor.findFirst as unknown as MockDbCall;
const vendorUpdate = db.vendor.update as unknown as MockDbCall;
const taskFindMany = db.task.findMany as unknown as MockDbCall;

describe('VendorTaskLinksService', () => {
  let service: VendorTaskLinksService;

  beforeEach(() => {
    service = new VendorTaskLinksService();
    jest.clearAllMocks();
  });

  describe('applyTaskLinks', () => {
    it('replaces links after validating vendor and task tenancy', async () => {
      vendorFindFirst.mockResolvedValue({ id: 'vnd_1' });
      taskFindMany.mockResolvedValue([{ id: 'task_1' }, { id: 'task_2' }]);
      vendorUpdate.mockResolvedValue({ id: 'vnd_1' });

      const result = await service.applyTaskLinks({
        vendorId: 'vnd_1',
        organizationId: 'org_1',
        taskIds: ['task_1', 'task_2'],
        replace: true,
      });

      expect(result).toEqual({ linked: 2 });
      expect(vendorFindFirst).toHaveBeenCalledWith({
        where: { id: 'vnd_1', organizationId: 'org_1' },
        select: { id: true },
      });
      expect(taskFindMany).toHaveBeenCalledWith({
        where: { id: { in: ['task_1', 'task_2'] }, organizationId: 'org_1' },
        select: { id: true },
      });
      expect(vendorUpdate).toHaveBeenCalledWith({
        where: { id: 'vnd_1' },
        data: {
          tasks: { set: [{ id: 'task_1' }, { id: 'task_2' }] },
          autoLinkRunId: null,
          autoLinkRunStartedAt: null,
        },
      });
    });

    it('connects links additively by default', async () => {
      vendorFindFirst.mockResolvedValue({ id: 'vnd_1' });
      taskFindMany.mockResolvedValue([{ id: 'task_1' }]);
      vendorUpdate.mockResolvedValue({ id: 'vnd_1' });

      await service.applyTaskLinks({
        vendorId: 'vnd_1',
        organizationId: 'org_1',
        taskIds: ['task_1'],
      });

      expect(vendorUpdate).toHaveBeenCalledWith({
        where: { id: 'vnd_1' },
        data: {
          tasks: { connect: [{ id: 'task_1' }] },
          autoLinkRunId: null,
          autoLinkRunStartedAt: null,
        },
      });
    });

    it('rejects tasks outside the organization', async () => {
      vendorFindFirst.mockResolvedValue({ id: 'vnd_1' });
      taskFindMany.mockResolvedValue([{ id: 'task_1' }]);

      await expect(
        service.applyTaskLinks({
          vendorId: 'vnd_1',
          organizationId: 'org_1',
          taskIds: ['task_1', 'task_other_org'],
        }),
      ).rejects.toThrow(BadRequestException);

      expect(vendorUpdate).not.toHaveBeenCalled();
    });

    it('returns 404 for a vendor outside the organization', async () => {
      vendorFindFirst.mockResolvedValue(null);

      await expect(
        service.applyTaskLinks({
          vendorId: 'vnd_1',
          organizationId: 'org_1',
          taskIds: [],
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('unlinkTask', () => {
    it('disconnects an existing task link scoped to the organization', async () => {
      vendorFindFirst.mockResolvedValue({
        id: 'vnd_1',
        tasks: [{ id: 'task_1' }],
      });
      vendorUpdate.mockResolvedValue({ id: 'vnd_1' });

      const result = await service.unlinkTask({
        vendorId: 'vnd_1',
        taskId: 'task_1',
        organizationId: 'org_1',
      });

      expect(result).toEqual({ ok: true });
      expect(vendorFindFirst).toHaveBeenCalledWith({
        where: { id: 'vnd_1', organizationId: 'org_1' },
        select: {
          id: true,
          tasks: { where: { id: 'task_1' }, select: { id: true } },
        },
      });
      expect(vendorUpdate).toHaveBeenCalledWith({
        where: { id: 'vnd_1' },
        data: { tasks: { disconnect: { id: 'task_1' } } },
      });
    });

    it('returns 404 when the task is not linked', async () => {
      vendorFindFirst.mockResolvedValue({ id: 'vnd_1', tasks: [] });

      await expect(
        service.unlinkTask({
          vendorId: 'vnd_1',
          taskId: 'task_1',
          organizationId: 'org_1',
        }),
      ).rejects.toThrow(NotFoundException);

      expect(vendorUpdate).not.toHaveBeenCalled();
    });
  });
});
