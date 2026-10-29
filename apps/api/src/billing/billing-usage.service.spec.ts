import { db } from '@db';
import { listBillingUsageRows } from './billing-usage';
import { BillingUsageService } from './billing-usage.service';

jest.mock('@db', () => ({
  db: { organizationBillingSubscription: { findMany: jest.fn() } },
}));
jest.mock('./billing-usage', () => ({ listBillingUsageRows: jest.fn() }));

describe('BillingUsageService', () => {
  it('loads only the requested organization without contacting Stripe or Trigger', async () => {
    const subscription = {
      id: 'obs_1',
      organizationId: 'org_1',
      stripeSubscriptionId: 'sub_1',
      stripeSubscriptionItemId: 'si_1',
      stripePriceId: 'price_1',
      canceledAt: null,
      createdAt: new Date('2026-10-01T00:00:00Z'),
      updatedAt: new Date('2026-10-01T00:00:00Z'),
      skuKey: 'pentest_monthly_1',
      stripeStatus: 'active',
      includedQuantity: 1,
      usedQuantity: 0,
      currentPeriodStart: new Date('2026-10-01T00:00:00Z'),
      currentPeriodEnd: new Date('2026-11-01T00:00:00Z'),
      cancelAtPeriodEnd: false,
    };
    const findMany = jest
      .spyOn(db.organizationBillingSubscription, 'findMany')
      .mockResolvedValue([subscription]);
    jest.mocked(listBillingUsageRows).mockResolvedValue([]);

    const result = await new BillingUsageService().getUsage('org_1');
    expect(findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org_1' },
      orderBy: { skuKey: 'asc' },
    });
    expect(listBillingUsageRows).toHaveBeenCalledWith({
      organizationId: 'org_1',
      subscriptions: [subscription],
    });
    expect(result.subscriptions[0]).toMatchObject({
      status: 'active',
      currentPeriodEnd: '2026-11-01T00:00:00.000Z',
    });
    expect(result.usageRows).toEqual([]);
  });
});
