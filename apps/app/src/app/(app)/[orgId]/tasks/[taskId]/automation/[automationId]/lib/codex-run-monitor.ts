const CODEX_COMPLETION_MARKER = 'codex-browser-run';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function findUnresolvedCodexRunIds(messages: readonly unknown[]): string[] {
  const dispatched = new Set<string>();
  const resolved = new Set<string>();

  for (const message of messages) {
    if (!isRecord(message) || !Array.isArray(message.parts)) continue;
    for (const part of message.parts) {
      if (!isRecord(part)) continue;
      if (part.type === 'tool-delegateBrowserTask' && isRecord(part.output)) {
        const runId = part.output.runId;
        if (part.output.status === 'dispatched' && typeof runId === 'string') {
          dispatched.add(runId);
        }
      }
      if (
        part.type === 'text' &&
        typeof part.text === 'string' &&
        part.text.includes(`[${CODEX_COMPLETION_MARKER}:`)
      ) {
        for (const runId of dispatched) {
          if (part.text.includes(`[${CODEX_COMPLETION_MARKER}:${runId}]`)) {
            resolved.add(runId);
          }
        }
      }
    }
  }

  return [...dispatched].filter((runId) => !resolved.has(runId));
}

export function buildCodexCompletionMessage({
  attachmentIds,
  runId,
  summary,
}: {
  attachmentIds: string[];
  runId: string;
  summary: string;
}): string {
  return `[${CODEX_COMPLETION_MARKER}:${runId}]
The durable Codex browser delegation completed.
Attachment IDs: ${attachmentIds.join(', ') || 'none'}
Codex summary: ${summary || 'No summary provided.'}
Continue the automation from this result. Verify that all required screenshot attachment IDs are present before updating the task status.`;
}

export function parseCodexRunResult(value: unknown): {
  attachmentIds: string[];
  status: string;
  summary: string;
} | null {
  if (!isRecord(value) || typeof value.status !== 'string') return null;
  if (!isRecord(value.output)) {
    return { attachmentIds: [], status: value.status, summary: '' };
  }
  const attachmentIds = value.output.attachmentIds;
  const summary = value.output.summary;
  if (
    !Array.isArray(attachmentIds) ||
    !attachmentIds.every((item) => typeof item === 'string') ||
    typeof summary !== 'string'
  ) {
    return null;
  }
  return { attachmentIds, status: value.status, summary };
}
