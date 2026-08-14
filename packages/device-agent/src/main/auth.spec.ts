import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('./logger', () => ({ log: vi.fn() }));
vi.mock('./store', () => ({
  clearAuth: vi.fn(),
  getApiUrl: vi.fn(),
  getPortalUrl: vi.fn(),
  setAuth: vi.fn(),
}));
vi.mock('electron', () => ({
  dialog: { showMessageBoxSync: vi.fn() },
  shell: { openExternal: vi.fn().mockResolvedValue(undefined) },
}));

describe('device-agent auth polling transport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the code when a later poll succeeds', async () => {
    (globalThis.fetch as unknown as Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: null }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 'code-abc' }),
      });

    const { pollForAuthCode } = await import('./auth');

    const pollPromise = pollForAuthCode({
      apiUrl: 'https://api.example.test',
      state: 'state-abc',
    });

    await vi.advanceTimersByTimeAsync(1100);
    await expect(pollPromise).resolves.toBe('code-abc');
  });
});
