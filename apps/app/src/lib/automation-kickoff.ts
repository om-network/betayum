import type { UIMessage } from 'ai';

export const LEGACY_AUTOMATION_KICKOFF = 'Build the automation script for this task.';

export const AUTOMATION_KICKOFF =
  'Collect evidence only; do not fix, configure, implement, remediate, or modify the system being inspected. Infer from the task description whether evidence requires screenshots, a read-only API script, a document, or a combination, then collect it with the available integrations. Delegate to Codex if screenshots are needed and consume its result in this conversation. If evidence is missing or insufficient, report the observed gap without trying to correct it. Finish every attempt by calling finalizeAutomationReview so the task is In Review, including failures and action-needed blockers with reviewer-facing remarks.';

export function normalizeAutomationKickoffMessages(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) =>
      part.type === 'text' && part.text.trim() === LEGACY_AUTOMATION_KICKOFF
        ? { ...part, text: AUTOMATION_KICKOFF }
        : part,
    ),
  }));
}
