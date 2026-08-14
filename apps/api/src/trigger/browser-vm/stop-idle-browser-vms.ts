import { schedules } from '@trigger.dev/sdk';
import { db } from '@db';

const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

export const stopIdleBrowserVms = schedules.task({
  id: 'stop-idle-browser-vms',
  cron: '*/5 * * * *',
  run: async () => {
    const apiUrl = process.env.BASE_URL;
    const serviceToken = process.env.SERVICE_TOKEN_TRIGGER;
    if (!apiUrl || !serviceToken) {
      throw new Error('Browser VM maintenance API configuration is missing');
    }

    const idleVms = await db.organizationBrowserVm.findMany({
      where: {
        state: 'running',
        lastActivityAt: {
          lte: new Date(Date.now() - IDLE_TIMEOUT_MS),
        },
      },
      select: { organizationId: true },
    });

    const results: Array<{ organizationId: string; stopped: boolean }> = [];
    for (const vm of idleVms) {
      const response = await fetch(
        `${apiUrl}/v1/integration-browser/maintenance/stop-idle`,
        {
          method: 'POST',
          headers: {
            'x-organization-id': vm.organizationId,
            'x-service-token': serviceToken,
          },
        },
      );
      if (!response.ok) {
        throw new Error(
          `Browser VM maintenance failed for ${vm.organizationId}: ${response.status}`,
        );
      }
      const body: unknown = await response.json();
      const stopped =
        typeof body === 'object' &&
        body !== null &&
        'stopped' in body &&
        body.stopped === true;
      results.push({ organizationId: vm.organizationId, stopped });
    }

    return { checked: idleVms.length, results };
  },
});
