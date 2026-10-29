import { Injectable } from '@nestjs/common';
import { db } from '@db';
import type { BillingStatus } from './billing.types';
import { listBillingUsageRows } from './billing-usage';

@Injectable()
export class BillingUsageService {
  async getUsage(
    organizationId: string,
  ): Promise<Pick<BillingStatus, 'subscriptions' | 'usageRows'>> {
    const subscriptions = await db.organizationBillingSubscription.findMany({
      where: { organizationId },
      orderBy: { skuKey: 'asc' },
    });
    const usageRows = await listBillingUsageRows({
      organizationId,
      subscriptions,
    });
    return {
      subscriptions: subscriptions.map((subscription) => ({
        skuKey: subscription.skuKey,
        status: subscription.stripeStatus,
        includedQuantity: subscription.includedQuantity,
        usedQuantity: subscription.usedQuantity,
        currentPeriodStart:
          subscription.currentPeriodStart?.toISOString() ?? null,
        currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      })),
      usageRows,
    };
  }
}
