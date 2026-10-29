import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PERMISSIONS_KEY, PermissionGuard } from '../auth/permission.guard';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingUsageService } from './billing-usage.service';
import { BillingWebhookService } from './billing-webhook.service';

jest.mock('../auth/hybrid-auth.guard', () => ({ HybridAuthGuard: class {} }));
jest.mock('@db', () => ({ db: {} }));
jest.mock('../auth/permission.guard', () => ({
  PermissionGuard: class {},
  PERMISSIONS_KEY: 'permissions',
}));
jest.mock('./billing.service', () => ({ BillingService: class {} }));
jest.mock('./billing-webhook.service', () => ({
  BillingWebhookService: class {},
}));
jest.mock('./billing-usage.service', () => ({ BillingUsageService: class {} }));

describe('Usage endpoint authorization', () => {
  it('requires authenticated organization read access, rather than billing write access', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, BillingController)).toEqual([
      HybridAuthGuard,
      PermissionGuard,
    ]);
    expect(
      Reflect.getMetadata(
        PERMISSIONS_KEY,
        BillingController.prototype.getUsage,
      ),
    ).toEqual([{ resource: 'organization', actions: ['read'] }]);
  });

  it('passes the authenticated organization context to the usage service', async () => {
    const usage = { subscriptions: [], usageRows: [] };
    const getUsage = jest.fn().mockResolvedValue(usage);
    const module = await Test.createTestingModule({
      controllers: [BillingController],
      providers: [
        { provide: BillingService, useValue: {} },
        { provide: BillingWebhookService, useValue: {} },
        { provide: BillingUsageService, useValue: { getUsage } },
      ],
    }).compile();
    await expect(
      module.get(BillingController).getUsage('org_context'),
    ).resolves.toEqual(usage);
    expect(getUsage).toHaveBeenCalledWith('org_context');
    await module.close();
  });
});
