import { Test, TestingModule } from '@nestjs/testing';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PERMISSIONS_KEY } from '../auth/permission.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RiskTaskLinksController } from './risk-task-links.controller';
import { RiskTaskLinksService } from './risk-task-links.service';

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
    risk: ['read', 'update'],
  },
  BUILT_IN_ROLE_PERMISSIONS: {},
}));

describe('RiskTaskLinksController', () => {
  let controller: RiskTaskLinksController;
  let service: jest.Mocked<RiskTaskLinksService>;

  const serviceMock = {
    applyTaskLinks: jest.fn(),
    unlinkTask: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RiskTaskLinksController],
      providers: [{ provide: RiskTaskLinksService, useValue: serviceMock }],
    })
      .overrideGuard(HybridAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(RiskTaskLinksController);
    service = module.get(RiskTaskLinksService);
    jest.clearAllMocks();
  });

  it('applies task links through the service', async () => {
    service.applyTaskLinks.mockResolvedValue({ linked: 2 });

    const result = await controller.applyTaskLinks(
      'risk_1',
      { taskIds: ['task_1', 'task_2'], replace: true },
      'org_1',
    );

    expect(result).toEqual({ linked: 2 });
    expect(service.applyTaskLinks).toHaveBeenCalledWith({
      riskId: 'risk_1',
      organizationId: 'org_1',
      taskIds: ['task_1', 'task_2'],
      replace: true,
    });
  });

  it('unlinks a task through the service', async () => {
    service.unlinkTask.mockResolvedValue({ ok: true });

    const result = await controller.unlinkTask('risk_1', 'task_1', 'org_1');

    expect(result).toEqual({ ok: true });
    expect(service.unlinkTask).toHaveBeenCalledWith({
      riskId: 'risk_1',
      taskId: 'task_1',
      organizationId: 'org_1',
    });
  });

  it('requires risk update permission on mutating handlers', () => {
    expect(
      Reflect.getMetadata(
        PERMISSIONS_KEY,
        RiskTaskLinksController.prototype.applyTaskLinks,
      ),
    ).toEqual([{ resource: 'risk', actions: ['update'] }]);
    expect(
      Reflect.getMetadata(
        PERMISSIONS_KEY,
        RiskTaskLinksController.prototype.unlinkTask,
      ),
    ).toEqual([{ resource: 'risk', actions: ['update'] }]);
  });
});
