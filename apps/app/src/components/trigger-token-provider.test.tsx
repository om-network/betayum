import { render, waitFor } from '@testing-library/react';
import { useApiClient } from '@trigger.dev/react-hooks';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TriggerTokenProvider } from './trigger-token-provider';

vi.mock('@/actions/trigger/heal-access-token', () => ({
  healAndSetAccessToken: vi.fn().mockResolvedValue('healed-public-token'),
}));

const baseURL = 'https://trigger.example.com';
const runId = 'run_cmqqgtl5x08lx0hohvv0qembf';

function RunSubscriber({ accessToken }: { accessToken?: string }) {
  const client = useApiClient({ accessToken, requestOptions: { retry: { maxAttempts: 1 } } });
  useEffect(() => {
    if (client) void client.retrieveRun(runId).catch(() => undefined);
  }, []);
  return null;
}

afterEach(() => vi.unstubAllGlobals());

describe('TriggerTokenProvider endpoint routing', () => {
  it.each([
    { name: 'cached onboarding token', triggerJobId: runId, initialToken: 'public-token' },
    { name: 'healed onboarding token', triggerJobId: runId, initialToken: undefined },
    {
      name: 'task-specific token without onboarding',
      triggerJobId: undefined,
      initialToken: undefined,
    },
  ])('uses the self-hosted API for $name', async ({ triggerJobId, initialToken }) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: 'test response' }), { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <TriggerTokenProvider
        baseURL={baseURL}
        triggerJobId={triggerJobId}
        initialToken={initialToken}
      >
        <RunSubscriber accessToken={triggerJobId ? undefined : 'task-public-token'} />
      </TriggerTokenProvider>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${baseURL}/api/v3/runs/${runId}`);
  });
});
