import { describe, expect, it } from 'vitest';

import {
  assistantStoredMessagesToUiMessages,
  uiMessagesToAssistantStoredMessages,
} from './assistant-message-history';

describe('assistant message history', () => {
  it('hydrates stored text messages into UI messages', () => {
    expect(
      assistantStoredMessagesToUiMessages([
        {
          id: 'msg-user',
          role: 'user',
          text: 'Summarize my open compliance gaps.',
          createdAt: 1710000000000,
        },
        {
          id: 'msg-assistant',
          role: 'assistant',
          text: 'You have two open policy tasks.',
          createdAt: 1710000001000,
        },
      ]),
    ).toEqual([
      {
        id: 'msg-user',
        role: 'user',
        parts: [{ type: 'text', text: 'Summarize my open compliance gaps.' }],
      },
      {
        id: 'msg-assistant',
        role: 'assistant',
        parts: [{ type: 'text', text: 'You have two open policy tasks.' }],
      },
    ]);
  });

  it('persists only non-empty user and assistant text content', () => {
    expect(
      uiMessagesToAssistantStoredMessages({
        messages: [
          {
            id: 'msg-user',
            role: 'user',
            parts: [
              { type: 'text', text: 'First line' },
              { type: 'text', text: 'Second line' },
            ],
          },
          {
            id: 'msg-empty',
            role: 'assistant',
            parts: [{ type: 'text', text: '   ' }],
          },
          {
            id: 'msg-system',
            role: 'system',
            parts: [{ type: 'text', text: 'Ignore me' }],
          },
        ],
        createdAt: 1710000002000,
      }),
    ).toEqual([
      {
        id: 'msg-user',
        role: 'user',
        text: 'First line\n\nSecond line',
        createdAt: 1710000002000,
      },
    ]);
  });
});
