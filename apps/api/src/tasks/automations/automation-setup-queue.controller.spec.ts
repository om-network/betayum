import 'reflect-metadata';

jest.mock('@trycompai/auth', () => ({
  BUILT_IN_ROLE_PERMISSIONS: {},
  PRIVILEGED_ROLES: [],
  RESTRICTED_ROLES: [],
  statement: { task: ['read', 'update'] },
}));
jest.mock('../../auth/auth.server', () => ({
  auth: { api: { getSession: jest.fn() } },
}));
jest.mock('../../auth/hybrid-auth.guard', () => ({
  HybridAuthGuard: class HybridAuthGuard {},
}));
jest.mock('./automation-setup-queue.service', () => ({
  AutomationSetupQueueService: class AutomationSetupQueueService {},
}));

import { PERMISSIONS_KEY } from '../../auth/permission.guard';
import { AutomationSetupQueueController } from './automation-setup-queue.controller';
import type { AutomationSetupQueueService } from './automation-setup-queue.service';

describe(AutomationSetupQueueController.name, () => {
  it('forwards reset requests within the authenticated organization', async () => {
    const reset = jest.fn().mockResolvedValue({
      automationIds: ['aut_1'],
      count: 1,
      taskIds: ['tsk_1'],
    });
    const controller = new AutomationSetupQueueController({
      reset,
    } as unknown as AutomationSetupQueueService);

    await expect(
      controller.reset('org_1', { automationIds: ['aut_1'] }),
    ).resolves.toMatchObject({ count: 1 });
    expect(reset).toHaveBeenCalledWith({
      automationIds: ['aut_1'],
      organizationId: 'org_1',
    });
  });

  it('requires task:update permission for reset', () => {
    expect(
      Reflect.getMetadata(
        PERMISSIONS_KEY,
        AutomationSetupQueueController.prototype.reset,
      ),
    ).toEqual([{ resource: 'task', actions: ['update'] }]);
  });
});
