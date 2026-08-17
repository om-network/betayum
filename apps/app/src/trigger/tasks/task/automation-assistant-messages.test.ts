import { describe, expect, it } from 'vitest';
import { includeAssistantCommand } from './automation-assistant-messages';

describe(includeAssistantCommand.name, () => {
  it('does not duplicate a command already persisted by the API', () => {
    const messages = [
      {
        id: 'message_1',
        role: 'user' as const,
        parts: [{ type: 'text' as const, text: 'GitHub' }],
      },
    ];

    expect(
      includeAssistantCommand({ clientRequestId: 'message_1', messages, text: 'GitHub' }),
    ).toBe(messages);
  });

  it('includes commands created before immediate persistence was introduced', () => {
    expect(
      includeAssistantCommand({ clientRequestId: 'message_1', messages: [], text: 'GitHub' }),
    ).toEqual([{ id: 'message_1', role: 'user', parts: [{ type: 'text', text: 'GitHub' }] }]);
  });
});
