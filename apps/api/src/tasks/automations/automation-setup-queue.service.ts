import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AutomationSetupItemStatus,
  AutomationSetupQueueStatus,
  AutomationSetupStatus,
  TaskStatus,
  db,
} from '@db';
import { tasks as triggerTasks } from '@trigger.dev/sdk';
import {
  AutomationSetupOutcome,
  type FinalizeAutomationSetupDto,
} from './dto/automation-setup-queue.dto';
import { automationOrganizationQueue } from './automation-trigger-queue';

const queueInclude = {
  items: {
    include: { task: { select: { id: true, status: true, title: true } } },
    orderBy: { position: 'asc' as const },
  },
};

const RESETTABLE_SETUP_STATUSES = [
  AutomationSetupStatus.ready,
  AutomationSetupStatus.action_needed,
  AutomationSetupStatus.failed,
] as const;

@Injectable()
export class AutomationSetupQueueService {
  get(organizationId: string) {
    return db.automationSetupQueue.findUnique({
      where: { organizationId },
      include: queueInclude,
    });
  }

  async start({
    organizationId,
    requestedByUserId,
    taskIds,
  }: {
    organizationId: string;
    requestedByUserId: string;
    taskIds: string[];
  }) {
    const uniqueTaskIds = [...new Set(taskIds)];
    if (uniqueTaskIds.length !== taskIds.length) {
      throw new BadRequestException('Queue contains duplicate tasks');
    }

    const existing = await this.get(organizationId);
    if (
      existing?.items.some(
        (item) => item.status === AutomationSetupItemStatus.building,
      )
    ) {
      return existing;
    }
    if (
      existing?.items.some(
        (item) => item.status === AutomationSetupItemStatus.queued,
      )
    ) {
      await db.automationSetupQueue.update({
        where: { id: existing.id },
        data: { triggerRunId: null },
      });
      const handle = await triggerTasks.trigger(
        'automation-setup-queue',
        { organizationId, queueId: existing.id },
        automationOrganizationQueue(organizationId),
      );
      return db.automationSetupQueue.update({
        where: { id: existing.id },
        data: { triggerRunId: handle.id },
        include: queueInclude,
      });
    }

    const eligibleTasks = await db.task.findMany({
      where: {
        id: { in: uniqueTaskIds },
        organizationId,
        archivedAt: null,
        status: { notIn: [TaskStatus.done, TaskStatus.not_relevant] },
        automationStatus: { not: 'MANUAL' },
      },
      select: { id: true },
    });
    if (eligibleTasks.length !== uniqueTaskIds.length) {
      throw new BadRequestException('Queue contains an ineligible task');
    }

    const result = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
      const active = await tx.automationSetupQueue.findUnique({
        where: { organizationId },
        include: queueInclude,
      });
      if (
        active?.items.some(
          (item) =>
            item.status === AutomationSetupItemStatus.queued ||
            item.status === AutomationSetupItemStatus.building,
        )
      ) {
        return { queue: active, shouldDispatch: false };
      }
      const saved = await tx.automationSetupQueue.upsert({
        where: { organizationId },
        create: {
          organizationId,
          requestedByUserId,
          items: {
            create: uniqueTaskIds.map((taskId, position) => ({
              taskId,
              position,
            })),
          },
        },
        update: {
          completedAt: null,
          currentItemId: null,
          currentPosition: 0,
          heartbeatAt: null,
          requestedByUserId,
          status: AutomationSetupQueueStatus.active,
          triggerRunId: null,
          items: {
            deleteMany: {},
            create: uniqueTaskIds.map((taskId, position) => ({
              taskId,
              position,
            })),
          },
        },
        include: queueInclude,
      });
      return { queue: saved, shouldDispatch: true };
    });
    if (!result.shouldDispatch) return result.queue;

    const handle = await triggerTasks.trigger(
      'automation-setup-queue',
      { organizationId, queueId: result.queue.id },
      automationOrganizationQueue(organizationId),
    );
    return db.automationSetupQueue.update({
      where: { id: result.queue.id },
      data: { triggerRunId: handle.id },
      include: queueInclude,
    });
  }

  async reset({
    automationIds,
    organizationId,
  }: {
    automationIds: string[];
    organizationId: string;
  }) {
    const uniqueAutomationIds = [...new Set(automationIds)];
    if (
      uniqueAutomationIds.length === 0 ||
      uniqueAutomationIds.length !== automationIds.length
    ) {
      throw new BadRequestException(
        uniqueAutomationIds.length === 0
          ? 'At least one automation is required'
          : 'Reset contains duplicate automations',
      );
    }

    return db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
      const automations = await tx.evidenceAutomation.findMany({
        where: {
          id: { in: uniqueAutomationIds },
          task: { organizationId },
        },
        select: {
          id: true,
          setupStatus: true,
          taskId: true,
          task: { select: { previousStatus: true, status: true } },
        },
      });
      const resettableStatuses = new Set<AutomationSetupStatus>(
        RESETTABLE_SETUP_STATUSES,
      );
      if (
        automations.length !== uniqueAutomationIds.length ||
        automations.some(
          (automation) =>
            !automation.setupStatus ||
            !resettableStatuses.has(automation.setupStatus),
        )
      ) {
        throw new BadRequestException(
          'Only terminal AI setup automations can be reset',
        );
      }

      const activeItem = await tx.automationSetupQueueItem.findFirst({
        where: {
          automationId: { in: uniqueAutomationIds },
          status: {
            in: [
              AutomationSetupItemStatus.queued,
              AutomationSetupItemStatus.building,
            ],
          },
        },
        select: { id: true },
      });
      if (activeItem) {
        throw new BadRequestException('An active automation cannot be reset');
      }

      await tx.evidenceAutomation.updateMany({
        where: { id: { in: uniqueAutomationIds } },
        data: {
          allowedTools: [],
          chatHistory: null,
          evaluationCriteria: null,
          isEnabled: false,
          scriptDraft: null,
          setupStatus: null,
          setupStatusUpdatedAt: null,
          setupTask: null,
        },
      });

      const tasksById = new Map(
        automations.map((automation) => [automation.taskId, automation.task]),
      );
      for (const [taskId, task] of tasksById) {
        const status =
          task.status === TaskStatus.in_review
            ? (task.previousStatus ?? TaskStatus.todo)
            : task.status === TaskStatus.done
              ? TaskStatus.todo
              : task.status;
        await tx.task.update({
          where: { id: taskId },
          data: { previousStatus: null, status },
        });
      }

      return {
        automationIds: uniqueAutomationIds,
        count: uniqueAutomationIds.length,
        taskIds: [...tasksById.keys()],
      };
    });
  }

  async finalize({
    dto,
    organizationId,
    taskId,
    userId,
  }: {
    dto: FinalizeAutomationSetupDto;
    organizationId: string;
    taskId: string;
    userId: string;
  }) {
    const actionRequired = dto.actionRequired?.trim();
    if (
      dto.outcome === AutomationSetupOutcome.action_needed &&
      !actionRequired
    ) {
      throw new BadRequestException(
        'actionRequired is required for action_needed',
      );
    }

    const member = await db.member.findFirst({
      where: { organizationId, userId, deactivated: false },
      select: { id: true },
    });
    if (!member)
      throw new BadRequestException('Queue initiator is not an active member');

    return db.$transaction(async (tx) => {
      const automation = await tx.evidenceAutomation.findFirst({
        where: { id: dto.automationId, taskId, task: { organizationId } },
        select: { id: true, setupStatus: true },
      });
      if (!automation) throw new BadRequestException('Automation not found');

      const item = await tx.automationSetupQueueItem.findFirst({
        where: {
          automationId: dto.automationId,
          taskId,
          queue: { organizationId },
        },
        include: { queue: true },
      });
      if (
        item &&
        item.status !== AutomationSetupItemStatus.building &&
        automation.setupStatus !== AutomationSetupStatus.building
      ) {
        return { alreadyFinalized: true, outcome: item.status };
      }
      const shouldAdvanceQueue =
        item?.status === AutomationSetupItemStatus.building;

      const task = await tx.task.findFirst({
        where: { id: taskId, organizationId },
        select: { status: true },
      });
      if (!task) throw new BadRequestException('Task not found');

      await tx.task.update({
        where: { id: taskId },
        data: {
          previousStatus:
            task.status === TaskStatus.in_review ? undefined : task.status,
          status: TaskStatus.in_review,
        },
      });
      await tx.comment.create({
        data: {
          authorId: member.id,
          content: dto.remarks.trim(),
          entityId: taskId,
          entityType: 'task',
          organizationId,
        },
      });
      await tx.evidenceAutomation.update({
        where: { id: dto.automationId },
        data: {
          isEnabled: dto.outcome === AutomationSetupOutcome.ready,
          setupStatus: dto.outcome as AutomationSetupStatus,
          setupStatusUpdatedAt: new Date(),
          setupTask:
            dto.outcome === AutomationSetupOutcome.action_needed
              ? actionRequired
              : null,
        },
      });

      if (item && shouldAdvanceQueue) {
        const nextItem = await tx.automationSetupQueueItem.findFirst({
          where: {
            queueId: item.queueId,
            status: AutomationSetupItemStatus.queued,
          },
          orderBy: { position: 'asc' },
          select: { id: true, position: true },
        });
        await tx.automationSetupQueueItem.update({
          where: { id: item.id },
          data: {
            completedAt: new Date(),
            remarks: dto.remarks.trim(),
            status: dto.outcome,
          },
        });
        await tx.automationSetupQueue.update({
          where: { id: item.queueId },
          data: nextItem
            ? {
                currentItemId: null,
                currentPosition: nextItem.position,
                heartbeatAt: new Date(),
              }
            : {
                completedAt: new Date(),
                currentItemId: null,
                currentPosition: item.position + 1,
                heartbeatAt: new Date(),
                status: AutomationSetupQueueStatus.completed,
              },
        });
      }

      return {
        alreadyFinalized: false,
        outcome: dto.outcome,
        taskStatus: TaskStatus.in_review,
      };
    });
  }
}
