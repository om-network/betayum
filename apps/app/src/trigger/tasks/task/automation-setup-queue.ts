import { AUTOMATION_KICKOFF } from '@/lib/automation-kickoff';
import { runAutomationQueueUntilEmpty } from '@/lib/automation-startup';
import { db } from '@db/server';
import { logger, runs, task, wait } from '@trigger.dev/sdk';
import { DefaultChatTransport, readUIMessageStream, type UIMessage } from 'ai';
import { AUTOMATION_ORGANIZATION_QUEUE } from './automation-organization-queue';
import {
  automationWorkerHeaders,
  claimAutomationSetupItem,
  finalizeAutomationSetupItem,
  type ClaimedAutomationSetupItem,
} from './automation-setup-queue-state';
import { persistedCodexResult, type CodexWaitResult } from './codex-persisted-result';

const TERMINAL_RUN_STATUSES = new Set([
  'CANCELED',
  'COMPLETED',
  'CRASHED',
  'EXPIRED',
  'FAILED',
  'SYSTEM_FAILURE',
  'TIMED_OUT',
]);

function appBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

export async function runAssistantTurn({
  automationId,
  messages,
  organizationId,
  taskId,
  userId,
}: {
  automationId: string;
  messages: UIMessage[];
  organizationId: string;
  taskId: string;
  userId: string;
}): Promise<UIMessage[]> {
  const transport = new DefaultChatTransport<UIMessage>({
    api: `${appBaseUrl()}/api/tasks-automations/chat`,
    body: {
      automationId,
      modelId: 'google/gemini-3.1-flash-lite-preview',
      orgId: organizationId,
      reasoningEffort: 'high',
      taskId,
    },
    headers: automationWorkerHeaders(organizationId, userId),
  });
  const stream = await transport.sendMessages({
    abortSignal: undefined,
    chatId: automationId,
    messageId: messages.at(-1)?.id,
    messages,
    trigger: 'submit-message',
  });
  let completed: UIMessage | undefined;
  for await (const message of readUIMessageStream({ stream, terminateOnError: true })) {
    completed = message;
  }
  if (!completed) throw new Error('Assistant returned no message');
  return [...messages, completed];
}

export async function waitForCodex(
  runId: string,
  handlePoll?: () => Promise<void>,
): Promise<CodexWaitResult> {
  const deadline = Date.now() + 35 * 60 * 1000;
  while (Date.now() < deadline) {
    await handlePoll?.();
    const persisted = await db.codexAutomationRun.findFirst({
      where: { OR: [{ id: runId }, { triggerRunId: runId }] },
      include: { screenshots: { select: { attachmentId: true } } },
    });
    const persistedResult = persistedCodexResult(persisted);
    if (persistedResult) return persistedResult;
    if (!persisted && !runId.startsWith('car_')) {
      const run = await runs.retrieve(runId);
      if (TERMINAL_RUN_STATUSES.has(run.status)) {
        return {
          output: {
            attachmentIds: [],
            summary: `Trigger run ended with ${run.status}.`,
          },
          status: run.status === 'COMPLETED' ? 'COMPLETED' : 'FAILED',
        };
      }
    }
    if (process.env.CODEX_AUTOMATION_LOCAL_DIRECT === 'true') {
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    } else {
      await wait.for({ seconds: 3 });
    }
  }
  throw new Error(`Codex delegation ${runId} timed out`);
}

export function latestAssistantRemarks(messages: UIMessage[]): string {
  const assistant = [...messages].reverse().find((message) => message.role === 'assistant');
  const text = assistant?.parts
    .filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();
  return text || 'Automation evidence collection finished and is ready for review.';
}

async function runItem(item: ClaimedAutomationSetupItem, organizationId: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333'}/v1/tasks/${item.taskId}/automations/${item.automationId}/assistant/messages`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...automationWorkerHeaders(organizationId, item.requestedByUserId),
      },
      body: JSON.stringify({
        clientRequestId: `setup-${item.itemId}`,
        text: AUTOMATION_KICKOFF,
      }),
    },
  );
  if (!response.ok) throw new Error(`Failed to start assistant run: ${response.status}`);
  const started: unknown = await response.json();
  if (
    typeof started !== 'object' ||
    started === null ||
    !('id' in started) ||
    typeof started.id !== 'string' ||
    !('generation' in started) ||
    typeof started.generation !== 'number'
  ) {
    throw new Error('Assistant API returned an invalid run');
  }
  const { executeAutomationAssistantRun } = await import('./automation-assistant-run');
  await executeAutomationAssistantRun(
    {
      automationId: item.automationId,
      generation: started.generation,
      organizationId,
      requestedByUserId: item.requestedByUserId,
      runId: started.id,
      taskId: item.taskId,
    },
    `inline-${item.itemId}`,
  );

  while (true) {
    const run = await db.automationAssistantRun.findUnique({
      where: { automationId: item.automationId },
      select: { errorMessage: true, status: true },
    });
    if (run?.status === 'failed') throw new Error(run.errorMessage ?? 'Assistant run failed');
    if (run?.status === 'completed' || run?.status === 'waiting_for_input') {
      const state = await db.automationSetupQueueItem.findUnique({
        where: { id: item.itemId },
        select: {
          status: true,
          task: { select: { status: true } },
          automation: { select: { setupTask: true } },
        },
      });
      if (state?.status !== 'building') return;
      if (run.status === 'waiting_for_input') {
        await finalizeAutomationSetupItem({
          actionRequired:
            state.automation?.setupTask ??
            'Provide the missing information requested by the assistant.',
          item,
          organizationId,
          outcome: 'action_needed',
          remarks: 'Automation setup is waiting for additional information.',
        });
        return;
      }
      if (state.task.status !== 'in_review') {
        throw new Error('Assistant ended without submitting the task for review');
      }
      await finalizeAutomationSetupItem({
        item,
        organizationId,
        outcome: 'ready',
        remarks: 'Automation evidence collection finished and is ready for review.',
      });
      return;
    }
    await wait.for({ seconds: 2 });
  }
}

export const automationSetupQueueTask = task({
  id: 'automation-setup-queue',
  maxDuration: 3600,
  queue: { name: AUTOMATION_ORGANIZATION_QUEUE, concurrencyLimit: 1 },
  run: async (
    { organizationId, queueId }: { organizationId: string; queueId: string },
    { ctx },
  ) => {
    const attempted = await runAutomationQueueUntilEmpty({
      claimNext: () => claimAutomationSetupItem(queueId, ctx.run.id),
      worker: (item) => runItem(item, organizationId),
      onFailure: async (item, error) => {
        logger.error('Automation setup item failed', { error, itemId: item.itemId });
        await finalizeAutomationSetupItem({
          item,
          organizationId,
          outcome: 'failed',
          remarks: error instanceof Error ? error.message : 'Automation setup failed',
        });
      },
    });
    return { attempted };
  },
});
