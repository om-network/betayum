const mockDb = {
  organizationBrowserVm: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('@db', () => ({
  BrowserVmState: {
    provisioning: 'provisioning',
    running: 'running',
    stopping: 'stopping',
    error: 'error',
  },
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
      code = '';
    },
  },
  db: mockDb,
}));

import { Test } from '@nestjs/testing';
import { BrowserVmLifecycleService } from './browser-vm-lifecycle.service';
import { GcpComputeService } from './gcp-compute.service';

describe(BrowserVmLifecycleService.name, () => {
  const compute = {
    projectId: 'project',
    zone: 'us-central1-a',
    createInstance: jest.fn(),
    stopInstance: jest.fn(),
  };
  let service: BrowserVmLifecycleService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        BrowserVmLifecycleService,
        { provide: GcpComputeService, useValue: compute },
      ],
    }).compile();
    service = module.get(BrowserVmLifecycleService);
  });

  it('creates one deterministic VM record before provisioning Compute', async () => {
    mockDb.organizationBrowserVm.findUnique.mockResolvedValue(null);
    mockDb.organizationBrowserVm.create.mockResolvedValue({ id: 'bvm_1' });
    compute.createInstance.mockResolvedValue('operation-1');
    mockDb.organizationBrowserVm.update.mockResolvedValue({
      id: 'bvm_1',
      operationName: 'operation-1',
    });

    await service.ensureVm('org_1');

    expect(mockDb.organizationBrowserVm.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org_1',
        instanceName: expect.stringMatching(/^betayum-browser-[a-f0-9]{16}$/),
      }),
    });
    expect(compute.createInstance).toHaveBeenCalledTimes(1);
  });

  it('stops a VM selected by the idle-session query', async () => {
    mockDb.organizationBrowserVm.findFirst.mockResolvedValue({
      id: 'bvm_1',
      instanceName: 'betayum-browser-1',
    });
    compute.stopInstance.mockResolvedValue('operation-stop');

    await expect(service.stopIdleVm('org_1')).resolves.toBe(true);

    expect(mockDb.organizationBrowserVm.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        organizationId: 'org_1',
        state: 'running',
        viewerSessions: {
          none: expect.objectContaining({
            status: { in: ['provisioning', 'ready', 'active'] },
          }),
        },
      }),
    });
    expect(mockDb.organizationBrowserVm.update).toHaveBeenCalledWith({
      where: { id: 'bvm_1' },
      data: { state: 'stopping', operationName: 'operation-stop' },
    });
  });
});
