import { db } from '@db/server';
import { logger, runs, schedules, tasks } from '@trigger.dev/sdk';
import { automationOrganizationQueue } from './automation-organization-queue';
import { needsAutomationQueueRecovery } from './automation-queue-recovery';

const LIVE_RUN_STATUSES = new Set([
  'PENDING_VERSION',
  'QUEUED',
  'DEQUEUED',
  'EXECUTING',
  'WAITING',
  'DELAYED',
]);

export const automationSetupQueueReconciler = schedules.task({
  id: 'automation-setup-queue-reconciler',
  cron: '* * * * *',
  run: async () => {
    const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
    await db.automationAssistantRun.updateMany({
      where: {
        status: 'running',
        OR: [{ heartbeatAt: null }, { heartbeatAt: { lt: staleBefore } }],
      },
      data: {
        completedAt: new Date(),
        errorMessage: 'Assistant worker lease expired before completion.',
        status: 'failed',
      },
    });
    const queues = await db.automationSetupQueue.findMany({
      where: { status: 'active', items: { some: { status: { in: ['queued', 'building'] } } } },
      select: {
        id: true,
        organizationId: true,
        triggerRunId: true,
        items: {
          where: { status: 'building' },
          select: {
            status: true,
            automation: {
              select: {
                assistantRun: { select: { status: true } },
                codexRuns: {
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                  select: { status: true },
                },
              },
            },
          },
        },
      },
    });
    let resumed = 0;
    for (const queue of queues) {
      if (queue.triggerRunId) {
        try {
          const run = await runs.retrieve(queue.triggerRunId);
          const mustRecover = queue.items.some(needsAutomationQueueRecovery);
          if (LIVE_RUN_STATUSES.has(run.status) && !mustRecover) continue;
        } catch (error) {
          logger.warn('Unable to retrieve automation queue run; redispatching', {
            error,
            queueId: queue.id,
          });
        }
      }
      await db.automationSetupQueue.update({
        where: { id: queue.id },
        data: { triggerRunId: null },
      });
      const handle = await tasks.trigger(
        'automation-setup-queue',
        {
          organizationId: queue.organizationId,
          queueId: queue.id,
        },
        automationOrganizationQueue(queue.organizationId),
      );
      await db.automationSetupQueue.update({
        where: { id: queue.id },
        data: { triggerRunId: handle.id },
      });
      resumed += 1;
    }
    const queuedAssistantRuns = await db.automationAssistantRun.findMany({
      where: {
        status: 'queued',
        OR: [{ triggerRunId: null }, { updatedAt: { lt: staleBefore } }],
      },
      orderBy: { updatedAt: 'asc' },
      select: {
        id: true,
        generation: true,
        requestedByUserId: true,
        automation: {
          select: {
            id: true,
            taskId: true,
            task: { select: { organizationId: true } },
          },
        },
      },
    });
    let assistantRunsResumed = 0;
    for (const run of queuedAssistantRuns) {
      const organizationId = run.automation.task.organizationId;
      const handle = await tasks.trigger(
        'automation-assistant-run',
        {
          automationId: run.automation.id,
          generation: run.generation,
          organizationId,
          requestedByUserId: run.requestedByUserId,
          runId: run.id,
          taskId: run.automation.taskId,
        },
        automationOrganizationQueue(organizationId),
      );
      await db.automationAssistantRun.updateMany({
        where: { id: run.id, generation: run.generation, status: 'queued' },
        data: { triggerRunId: handle.id },
      });
      assistantRunsResumed += 1;
    }
    return { assistantRunsResumed, inspected: queues.length, resumed };
  },
});
