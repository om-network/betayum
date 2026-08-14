import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { hasAttachedAutomationEvidence } from './automation-completion';

function message(parts: UIMessage['parts']): UIMessage {
  return { id: crypto.randomUUID(), role: 'assistant', parts };
}

describe(hasAttachedAutomationEvidence.name, () => {
  it('detects attached tool output', () => {
    const messages = [
      message([
        {
          type: 'tool-createGoogleDoc',
          toolCallId: 'call_1',
          state: 'output-available',
          input: {},
          output: { attachedToTask: true, attachmentId: 'att_1' },
        },
      ]),
    ];

    expect(hasAttachedAutomationEvidence(messages)).toBe(true);
  });

  it('detects final Codex attachment IDs but rejects an empty completion', () => {
    expect(
      hasAttachedAutomationEvidence([
        message([{ type: 'text', text: 'Attachment IDs: att_final_1' }]),
      ]),
    ).toBe(true);
    expect(
      hasAttachedAutomationEvidence([
        message([{ type: 'text', text: 'Attachment IDs: none' }]),
      ]),
    ).toBe(false);
  });
});
