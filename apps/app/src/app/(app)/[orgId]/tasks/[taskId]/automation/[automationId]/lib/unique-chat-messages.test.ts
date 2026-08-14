import { describe, expect, it } from 'vitest';
import { ensureUniqueChatMessageIds } from './unique-chat-messages';

describe(ensureUniqueChatMessageIds.name, () => {
  it('assigns stable unique IDs without dropping duplicate provider messages', () => {
    const messages = [
      { id: 'duplicate', text: 'First' },
      { id: 'duplicate', text: 'Second' },
      { id: 'duplicate--2', text: 'Existing suffix' },
    ];

    expect(ensureUniqueChatMessageIds(messages)).toEqual([
      { id: 'duplicate', text: 'First' },
      { id: 'duplicate--2', text: 'Second' },
      { id: 'duplicate--2--1', text: 'Existing suffix' },
    ]);
  });
});
