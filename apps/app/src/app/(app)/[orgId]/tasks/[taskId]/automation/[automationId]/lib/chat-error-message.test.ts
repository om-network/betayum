import { describe, expect, it } from 'vitest';
import { getAutomationChatErrorMessage } from './chat-error-message';

describe('getAutomationChatErrorMessage', () => {
  it('uses the first-party automation generation unavailable message from JSON errors', () => {
    expect(
      getAutomationChatErrorMessage(
        JSON.stringify({
          error: 'automation_generation_unavailable',
          message:
            'First-party automation generation is not available yet. Drafts, publish, and manual runs remain first-party scoped.',
        }),
      ),
    ).toBe(
      'First-party automation generation is not available yet. Drafts, publish, and manual runs remain first-party scoped.',
    );
  });

  it('falls back to the known generation unavailable message when only the code is present', () => {
    expect(getAutomationChatErrorMessage('automation_generation_unavailable')).toBe(
      'First-party automation generation is not available yet. Drafts, publish, and manual runs remain first-party scoped.',
    );
  });

  it('keeps the generic communication prefix for unknown errors', () => {
    expect(getAutomationChatErrorMessage('upstream failed')).toBe(
      'Communication error with the AI: upstream failed',
    );
  });
});
