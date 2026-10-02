import { afterEach, describe, expect, it } from 'vitest';
import { isTriggerServiceToken } from './service-token';

describe('isTriggerServiceToken', () => {
  const originalToken = process.env.SERVICE_TOKEN_TRIGGER;

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.SERVICE_TOKEN_TRIGGER;
    } else {
      process.env.SERVICE_TOKEN_TRIGGER = originalToken;
    }
  });

  it('accepts the worker token when the deployed secret has a trailing newline', () => {
    process.env.SERVICE_TOKEN_TRIGGER = 'shared-secret\n';
    expect(isTriggerServiceToken('shared-secret')).toBe(true);
  });

  it('rejects a different token', () => {
    process.env.SERVICE_TOKEN_TRIGGER = 'shared-secret\n';
    expect(isTriggerServiceToken('wrong-secret')).toBe(false);
  });
});
