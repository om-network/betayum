import type { UIMessage } from 'ai';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function outputHasAttachment(output: unknown): boolean {
  if (!isRecord(output)) return false;
  if (output.attachedToTask === true) return true;
  if (typeof output.attachmentId === 'string') return true;
  return (
    Array.isArray(output.attachmentIds) &&
    output.attachmentIds.some((value) => typeof value === 'string')
  );
}

export function hasAttachedAutomationEvidence(
  messages: readonly UIMessage[],
): boolean {
  return messages.some((message) =>
    message.parts.some((part) => {
      if (!isRecord(part)) return false;
      if ('output' in part && outputHasAttachment(part.output)) return true;
      return (
        part.type === 'text' &&
        typeof part.text === 'string' &&
        /Attachment IDs:\s*att_[a-zA-Z0-9_-]+/.test(part.text)
      );
    }),
  );
}
