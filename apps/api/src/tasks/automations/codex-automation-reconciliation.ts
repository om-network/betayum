import { CodexAutomationRunStatus, db } from '@db';

const STALE_RUN_AGE_MS = 30 * 60 * 1000;

function parseChatHistory(chatHistory: string | null): unknown[] {
  if (!chatHistory) return [];
  try {
    const parsed: unknown = JSON.parse(chatHistory);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function hasMessageId(message: unknown, id: string): boolean {
  return (
    typeof message === 'object' &&
    message !== null &&
    'id' in message &&
    message.id === id
  );
}

export async function reconcileCodexAutomation({
  automationId,
  message,
  successful,
  runId,
}: {
  automationId: string;
  message: string;
  successful: boolean;
  runId: string;
}): Promise<void> {
  await db.$transaction(async (tx) => {
    const automation = await tx.evidenceAutomation.findUnique({
      where: { id: automationId },
      select: { chatHistory: true },
    });
    if (!automation) return;

    const messageId = `codex-result-${runId}`;
    const history = parseChatHistory(automation.chatHistory);
    if (!history.some((item) => hasMessageId(item, messageId))) {
      history.push({
        id: messageId,
        role: 'assistant',
        parts: [
          {
            type: 'text',
            text: `[codex-browser-run:${runId}] ${message}`,
          },
        ],
      });
    }

    await tx.evidenceAutomation.update({
      where: { id: automationId },
      data: {
        chatHistory: JSON.stringify(history),
      },
    });
  });
}

export async function expireStaleCodexAutomationRuns({
  organizationId,
}: {
  organizationId: string;
}): Promise<number> {
  const staleRuns = await db.codexAutomationRun.findMany({
    where: {
      organizationId,
      status: {
        in: [
          CodexAutomationRunStatus.pending,
          CodexAutomationRunStatus.dispatched,
        ],
      },
      createdAt: { lt: new Date(Date.now() - STALE_RUN_AGE_MS) },
    },
    select: { automationId: true, id: true },
  });

  for (const run of staleRuns) {
    const message =
      'Codex browser delegation expired without a completion response.';
    const updated = await db.codexAutomationRun.updateMany({
      where: {
        id: run.id,
        status: {
          in: [
            CodexAutomationRunStatus.pending,
            CodexAutomationRunStatus.dispatched,
          ],
        },
      },
      data: {
        completedAt: new Date(),
        errorMessage: message,
        status: CodexAutomationRunStatus.timed_out,
      },
    });
    if (updated.count === 1) {
      await reconcileCodexAutomation({
        automationId: run.automationId,
        message,
        runId: run.id,
        successful: false,
      });
    }
  }

  return staleRuns.length;
}
