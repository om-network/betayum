import { db } from '@db/server';

export type ClaimedAutomationSetupItem = {
  automationId: string;
  itemId: string;
  requestedByUserId: string;
  taskId: string;
};

export function automationWorkerHeaders(organizationId: string, userId: string) {
  const token = process.env.SERVICE_TOKEN_TRIGGER;
  if (!token) throw new Error('SERVICE_TOKEN_TRIGGER is required');
  return {
    'x-organization-id': organizationId,
    'x-service-token': token,
    'x-user-id': userId,
  };
}

export async function claimAutomationSetupItem(
  queueId: string,
  runnerId: string,
): Promise<ClaimedAutomationSetupItem | null> {
  return db.$transaction(async (tx) => {
    const queue = await tx.automationSetupQueue.findUnique({
      where: { id: queueId },
      include: {
        items: { orderBy: { position: 'asc' }, include: { task: true } },
      },
    });
    if (!queue || queue.status === 'completed') return null;
    if (queue.triggerRunId && queue.triggerRunId !== runnerId) return null;
    if (!queue.triggerRunId) {
      await tx.automationSetupQueue.update({
        where: { id: queue.id },
        data: { triggerRunId: runnerId },
      });
    }

    const current = queue.items.find((item) => item.status === 'building');
    if (current?.automationId) {
      return {
        automationId: current.automationId,
        itemId: current.id,
        requestedByUserId: queue.requestedByUserId,
        taskId: current.taskId,
      };
    }

    const item = queue.items.find((candidate) => candidate.status === 'queued');
    if (!item) {
      await tx.automationSetupQueue.update({
        where: { id: queue.id },
        data: { completedAt: new Date(), currentItemId: null, status: 'completed' },
      });
      return null;
    }

    const claimed = await tx.automationSetupQueueItem.updateMany({
      where: { id: item.id, status: 'queued' },
      data: { startedAt: new Date(), status: 'building' },
    });
    if (claimed.count !== 1) return null;

    const failedAutomation = await tx.evidenceAutomation.findFirst({
      where: { taskId: item.taskId, setupStatus: 'failed' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    const existingAutomation =
      failedAutomation ??
      (await tx.evidenceAutomation.findFirst({
        where: { taskId: item.taskId },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      }));
    const automation =
      existingAutomation ??
      (await tx.evidenceAutomation.create({
        data: { name: `${item.task.title} - Evidence Collection`, taskId: item.taskId },
        select: { id: true },
      }));
    await tx.evidenceAutomation.update({
      where: { id: automation.id },
      data: {
        setupStatus: 'building',
        setupStatusUpdatedAt: new Date(),
        setupTask: null,
      },
    });
    await tx.automationSetupQueueItem.update({
      where: { id: item.id },
      data: { automationId: automation.id },
    });
    await tx.automationSetupQueue.update({
      where: { id: queue.id },
      data: {
        currentItemId: item.id,
        currentPosition: item.position,
        heartbeatAt: new Date(),
      },
    });
    return {
      automationId: automation.id,
      itemId: item.id,
      requestedByUserId: queue.requestedByUserId,
      taskId: item.taskId,
    };
  });
}

export async function finalizeAutomationSetupItem({
  actionRequired,
  item,
  organizationId,
  outcome,
  remarks,
}: {
  actionRequired?: string;
  item: ClaimedAutomationSetupItem;
  organizationId: string;
  outcome: 'action_needed' | 'failed' | 'ready';
  remarks: string;
}) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333'}/v1/task-automation-queue/${item.taskId}/finalize`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...automationWorkerHeaders(organizationId, item.requestedByUserId),
      },
      body: JSON.stringify({
        actionRequired,
        automationId: item.automationId,
        outcome,
        remarks,
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Failed to finalize queue item: ${response.status}`);
  }
}
