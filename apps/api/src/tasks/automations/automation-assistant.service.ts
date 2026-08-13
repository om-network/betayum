import { Injectable, NotFoundException } from '@nestjs/common';
import { AutomationAssistantRunStatus, Prisma, db } from '@db';
import { tasks as triggerTasks } from '@trigger.dev/sdk';
import { automationOrganizationQueue } from './automation-trigger-queue';

const activeStatuses = [
  AutomationAssistantRunStatus.queued,
  AutomationAssistantRunStatus.running,
] as const;
const ACTIVE_RUN_LEASE_MS = 5 * 60 * 1000;

function hasActiveLease(run: {
  heartbeatAt: Date | null;
  status: string;
  updatedAt: Date;
}) {
  if (!activeStatuses.includes(run.status as (typeof activeStatuses)[number]))
    return false;
  const leaseAt =
    run.status === AutomationAssistantRunStatus.running
      ? run.heartbeatAt
      : run.updatedAt;
  return Boolean(
    leaseAt && leaseAt.getTime() > Date.now() - ACTIVE_RUN_LEASE_MS,
  );
}

function appendUserMessage({
  chatHistory,
  clientRequestId,
  text,
}: {
  chatHistory: string | null;
  clientRequestId: string;
  text: string;
}) {
  let messages: unknown[] = [];
  if (chatHistory) {
    try {
      const parsed: unknown = JSON.parse(chatHistory);
      if (Array.isArray(parsed)) messages = parsed;
    } catch {
      messages = [];
    }
  }
  return JSON.stringify([
    ...messages,
    {
      id: clientRequestId,
      role: 'user',
      parts: [{ type: 'text', text }],
    },
  ]);
}

@Injectable()
export class AutomationAssistantService {
  async submitMessage({
    automationId,
    clientRequestId,
    organizationId,
    requestedByUserId,
    taskId,
    text,
  }: {
    automationId: string;
    clientRequestId: string;
    organizationId: string;
    requestedByUserId: string;
    taskId: string;
    text: string;
  }) {
    await this.assertScope({ automationId, organizationId, taskId });
    let result: {
      run: Awaited<
        ReturnType<typeof db.automationAssistantRun.findUniqueOrThrow>
      >;
      dispatch: boolean;
    };
    try {
      result = await db.$transaction(
        async (tx) => {
          const existingCommand =
            await tx.automationAssistantCommand.findUnique({
              where: { clientRequestId },
              include: { run: true },
            });
          if (existingCommand)
            return { run: existingCommand.run, dispatch: false };

          const existingRun = await tx.automationAssistantRun.findUnique({
            where: { automationId },
          });
          const automation = await tx.evidenceAutomation.findUniqueOrThrow({
            where: { id: automationId },
            select: { chatHistory: true },
          });
          const isActive = existingRun ? hasActiveLease(existingRun) : false;
          const generation = existingRun
            ? existingRun.generation + (isActive ? 0 : 1)
            : 1;
          const run = await tx.automationAssistantRun.upsert({
            where: { automationId },
            create: {
              automationId,
              generation,
              requestedByUserId,
            },
            update: isActive
              ? { requestedByUserId }
              : {
                  completedAt: null,
                  errorMessage: null,
                  generation,
                  requestedByUserId,
                  startedAt: null,
                  status: AutomationAssistantRunStatus.queued,
                  triggerRunId: null,
                },
          });
          await tx.automationAssistantCommand.create({
            data: {
              clientRequestId,
              runId: run.id,
              submittedByUserId: requestedByUserId,
              text,
            },
          });
          await tx.evidenceAutomation.update({
            where: { id: automationId },
            data: {
              chatHistory: appendUserMessage({
                chatHistory: automation.chatHistory,
                clientRequestId,
                text,
              }),
              setupStatusUpdatedAt: new Date(),
              setupTask: null,
            },
          });
          return { run, dispatch: !isActive };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }
      const duplicate = await db.automationAssistantCommand.findUniqueOrThrow({
        where: { clientRequestId },
        include: { run: true },
      });
      result = { run: duplicate.run, dispatch: false };
    }

    if (!result.dispatch)
      return this.getRun({ automationId, organizationId, taskId });
    const handle = await triggerTasks.trigger(
      'automation-assistant-run',
      {
        automationId,
        generation: result.run.generation,
        organizationId,
        requestedByUserId,
        runId: result.run.id,
        taskId,
      },
      automationOrganizationQueue(organizationId),
    );
    await db.automationAssistantRun.updateMany({
      where: { id: result.run.id, generation: result.run.generation },
      data: { triggerRunId: handle.id },
    });
    return this.getRun({ automationId, organizationId, taskId });
  }

  async getRun({
    automationId,
    organizationId,
    taskId,
  }: {
    automationId: string;
    organizationId: string;
    taskId: string;
  }) {
    await this.assertScope({ automationId, organizationId, taskId });
    const run = await db.automationAssistantRun.findUnique({
      where: { automationId },
      include: {
        _count: { select: { commands: { where: { status: 'pending' } } } },
      },
    });
    if (!run) return null;
    return {
      ...run,
      pendingCommandCount: run._count.commands,
      _count: undefined,
    };
  }

  private async assertScope(params: {
    automationId: string;
    organizationId: string;
    taskId: string;
  }) {
    const automation = await db.evidenceAutomation.findFirst({
      where: {
        id: params.automationId,
        taskId: params.taskId,
        task: { organizationId: params.organizationId },
      },
      select: { id: true },
    });
    if (!automation) throw new NotFoundException('Automation not found');
  }
}
