import { Test, TestingModule } from '@nestjs/testing';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PERMISSIONS_KEY } from '../auth/permission.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { VendorTaskLinksController } from './vendor-task-links.controller';
import { VendorTaskLinksService } from './vendor-task-links.service';

jest.mock('@db', () => ({
  db: {},
}));

jest.mock('../auth/auth.server', () => ({
  auth: {
    api: {
      getSession: jest.fn(),
    },
  },
}));

jest.mock('@trycompai/auth', () => ({
  statement: {
    vendor: ['read', 'update'],
  },
  BUILT_IN_ROLE_PERMISSIONS: {},
}));

describe('VendorTaskLinksController', () => {
  let controller: VendorTaskLinksController;
  let service: jest.Mocked<VendorTaskLinksService>;

  const serviceMock = {
    applyTaskLinks: jest.fn(),
    unlinkTask: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VendorTaskLinksController],
      providers: [{ provide: VendorTaskLinksService, useValue: serviceMock }],
    })
      .overrideGuard(HybridAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(VendorTaskLinksController);
    service = module.get(VendorTaskLinksService);
    jest.clearAllMocks();
  });

  it('applies task links through the service', async () => {
    service.applyTaskLinks.mockResolvedValue({ linked: 2 });

    const result = await controller.applyTaskLinks(
      'vnd_1',
      { taskIds: ['task_1', 'task_2'], replace: true },
      'org_1',
    );

    expect(result).toEqual({ linked: 2 });
    expect(service.applyTaskLinks).toHaveBeenCalledWith({
      vendorId: 'vnd_1',
      organizationId: 'org_1',
      taskIds: ['task_1', 'task_2'],
      replace: true,
    });
  });

  it('unlinks a task through the service', async () => {
    service.unlinkTask.mockResolvedValue({ ok: true });

    const result = await controller.unlinkTask('vnd_1', 'task_1', 'org_1');

    expect(result).toEqual({ ok: true });
    expect(service.unlinkTask).toHaveBeenCalledWith({
      vendorId: 'vnd_1',
      taskId: 'task_1',
      organizationId: 'org_1',
    });
  });

  it('requires vendor update permission on mutating handlers', () => {
    expect(
      Reflect.getMetadata(
        PERMISSIONS_KEY,
        VendorTaskLinksController.prototype.applyTaskLinks,
      ),
    ).toEqual([{ resource: 'vendor', actions: ['update'] }]);
    expect(
      Reflect.getMetadata(
        PERMISSIONS_KEY,
        VendorTaskLinksController.prototype.unlinkTask,
      ),
    ).toEqual([{ resource: 'vendor', actions: ['update'] }]);
  });
});
