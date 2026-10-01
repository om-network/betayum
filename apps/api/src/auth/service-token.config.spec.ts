import { resolveServiceByToken } from './service-token.config';

describe('resolveServiceByToken', () => {
  const originalToken = process.env.SERVICE_TOKEN_TRIGGER;

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.SERVICE_TOKEN_TRIGGER;
    } else {
      process.env.SERVICE_TOKEN_TRIGGER = originalToken;
    }
  });

  it('accepts a token when the configured secret ends with a newline', () => {
    process.env.SERVICE_TOKEN_TRIGGER = 'trigger-service-token\n';

    expect(resolveServiceByToken('trigger-service-token')?.key).toBe('trigger');
  });

  it('still rejects a different token', () => {
    process.env.SERVICE_TOKEN_TRIGGER = 'trigger-service-token\n';

    expect(resolveServiceByToken('different-token')).toBeNull();
  });
});
