import {
  buildCodexCompletionMessage,
  findUnresolvedCodexRunIds,
  parseCodexRunResult,
} from '@/app/(app)/[orgId]/tasks/[taskId]/automation/[automationId]/lib/codex-run-monitor';
import { db } from '@db/server';
import { logger, task } from '@trigger.dev/sdk';
import type { UIMessage } from 'ai';
import { includeAssistantCommand } from './automation-assistant-messages';
import { AUTOMATION_ORGANIZATION_QUEUE } from './automation-organization-queue';
import { runAssistantTurn, waitForCodex } from './automation-setup-queue';

export type AutomationAssistantPayload = {
  automationId: string;
  generation: number;
  organizationId: string;
  requestedByUserId: string;
  runId: string;
  taskId: string;
};

function parseMessages(value: string | null): UIMessage[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as UIMessage[]) : [];
  } catch {
    return [];
  }
}

export async function claimAutomationAssistantRun(
  payload: AutomationAssistantPayload,
  triggerRunId: string,
) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${payload.organizationId}))`;
    await tx.automationAssistantRun.updateMany({
      where: {
        id: { not: payload.runId },
        status: 'running',
        OR: [{ heartbeatAt: null }, { heartbeatAt: { lt: new Date(Date.now() - 5 * 60 * 1000) } }],
        automation: { task: { organizationId: payload.organizationId } },
      },
      data: {
        completedAt: new Date(),
        errorMessage: 'Assistant worker lease expired before completion.',
        status: 'failed',
      },
    });
    const active = await tx.automationAssistantRun.findFirst({
      where: {
        id: { not: payload.runId },
        status: 'running',
        heartbeatAt: { gt: new Date(Date.now() - 5 * 60 * 1000) },
        automation: { task: { organizationId: payload.organizationId } },
      },
      select: { id: true },
    });
    if (active) {
      await tx.automationAssistantRun.updateMany({
        where: { id: payload.runId, generation: payload.generation, status: 'queued' },
        data: { triggerRunId: null },
      });
      return false;
    }
    const claimed = await tx.automationAssistantRun.updateMany({
      where: { id: payload.runId, generation: payload.generation, status: 'queued' },
      data: {
        heartbeatAt: new Date(),
        startedAt: new Date(),
        status: 'running',
        triggerRunId,
      },
    });
    if (claimed.count !== 1) return false;
    await tx.evidenceAutomation.update({
      where: { id: payload.automationId },
      data: {
        setupStatus: 'building',
        setupStatusUpdatedAt: new Date(),
        setupTask: null,
      },
    });
    return true;
  });
}

async function ownsRun(payload: AutomationAssistantPayload) {
  return Boolean(
    await db.automationAssistantRun.findFirst({
      where: { id: payload.runId, generation: payload.generation, status: 'running' },
      select: { id: true },
    }),
  );
}

async function heartbeat(payload: AutomationAssistantPayload) {
  await db.automationAssistantRun.updateMany({
    where: { id: payload.runId, generation: payload.generation, status: 'running' },
    data: { heartbeatAt: new Date() },
  });
}

async function withHeartbeat<T>(payload: AutomationAssistantPayload, operation: () => Promise<T>) {
  await heartbeat(payload);
  const interval = setInterval(() => {
    void heartbeat(payload);
  }, 30_000);
  try {
    return await operation();
  } finally {
    clearInterval(interval);
  }
}

async function completeCodexRuns({
  messages,
  payload,
}: {
  messages: UIMessage[];
  payload: AutomationAssistantPayload;
}) {
  let current = messages;
  for (const runId of findUnresolvedCodexRunIds(current)) {
    if (!(await ownsRun(payload))) return current;
    await heartbeat(payload);
    const run = await waitForCodex(runId, () => heartbeat(payload));
    if (!(await ownsRun(payload))) return current;
    const parsed = parseCodexRunResult({ output: run.output, status: run.status });
    const text =
      parsed?.status === 'COMPLETED'
        ? buildCodexCompletionMessage({
            attachmentIds: parsed.attachmentIds,
            runId,
            summary: parsed.summary,
          })
        : `[codex-browser-run:${runId}] Codex ended with ${run.status}: ${parsed?.summary || 'No result was returned.'} Record this blocker and finalize.`;
    current = await withHeartbeat(payload, () =>
      runAssistantTurn({
        automationId: payload.automationId,
        messages: [
          ...current,
          { id: `codex-result-${runId}`, role: 'user', parts: [{ type: 'text', text }] },
        ],
        organizationId: payload.organizationId,
        taskId: payload.taskId,
        userId: payload.requestedByUserId,
      }),
    );
  }
  return current;
}

async function runCommands(payload: AutomationAssistantPayload) {
  while (true) {
    if (!(await ownsRun(payload))) return;
    const command = await db.automationAssistantCommand.findFirst({
      where: { runId: payload.runId, status: 'pending' },
      orderBy: { createdAt: 'asc' },
    });
    if (!command) return;
    await heartbeat(payload);

    const automation = await db.evidenceAutomation.findUniqueOrThrow({
      where: { id: payload.automationId },
      select: { chatHistory: true },
    });
    const messages = parseMessages(automation.chatHistory);
    const withUserMessage = includeAssistantCommand({
      clientRequestId: command.clientRequestId,
      messages,
      text: command.text,
    });
    const response = await withHeartbeat(payload, () =>
      runAssistantTurn({
        automationId: payload.automationId,
        messages: withUserMessage,
        organizationId: payload.organizationId,
        taskId: payload.taskId,
        userId: command.submittedByUserId,
      }),
    );
    if (!(await ownsRun(payload))) return;
    await completeCodexRuns({ messages: response, payload });
    await db.automationAssistantCommand.updateMany({
      where: { id: command.id, status: 'pending' },
      data: { consumedAt: new Date(), status: 'consumed' },
    });
    await db.automationAssistantRun.updateMany({
      where: { id: payload.runId, generation: payload.generation, status: 'running' },
      data: { heartbeatAt: new Date() },
    });
  }
}

async function finishRun(payload: AutomationAssistantPayload) {
  return db.$transaction(async (tx) => {
    const pending = await tx.automationAssistantCommand.count({
      where: { runId: payload.runId, status: 'pending' },
    });
    if (pending > 0) return false;
    const automation = await tx.evidenceAutomation.findUniqueOrThrow({
      where: { id: payload.automationId },
      select: { setupStatus: true },
    });
    const status =
      automation.setupStatus === 'action_needed'
        ? 'waiting_for_input'
        : automation.setupStatus === 'failed'
          ? 'failed'
          : 'completed';
    await tx.automationAssistantRun.updateMany({
      where: { id: payload.runId, generation: payload.generation, status: 'running' },
      data: { completedAt: new Date(), heartbeatAt: new Date(), status },
    });
    return true;
  });
}

export const automationAssistantRunTask = task({
  id: 'automation-assistant-run',
  maxDuration: 3600,
  queue: { name: AUTOMATION_ORGANIZATION_QUEUE, concurrencyLimit: 1 },
  run: (payload: AutomationAssistantPayload, { ctx }) =>
    executeAutomationAssistantRun(payload, ctx.run.id),
});

export async function executeAutomationAssistantRun(
  payload: AutomationAssistantPayload,
  runnerId: string,
) {
  if (!(await claimAutomationAssistantRun(payload, runnerId))) return { claimed: false };
  try {
    while (true) {
      await runCommands(payload);
      if (await finishRun(payload)) break;
    }
    return { claimed: true };
  } catch (error) {
    logger.error('Automation assistant run failed', { error, runId: payload.runId });
    await db.automationAssistantRun.updateMany({
      where: { id: payload.runId, generation: payload.generation },
      data: {
        completedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : 'Assistant run failed',
        heartbeatAt: new Date(),
        status: 'failed',
      },
    });
    throw error;
  }
}
