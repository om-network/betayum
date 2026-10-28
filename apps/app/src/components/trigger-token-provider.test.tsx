import { healAndSetAccessToken } from '@/actions/trigger/heal-access-token';
import { usePolicyOnboardingStatus } from '@/app/(app)/[orgId]/policies/(overview)/hooks/use-policy-onboarding-status';
import { useOnboardingStatus } from '@/app/(app)/[orgId]/risk/(overview)/hooks/use-onboarding-status';
import { render, screen, waitFor } from '@testing-library/react';
import { useApiClient, useTriggerAuthContext } from '@trigger.dev/react-hooks';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TriggerTokenProvider } from './trigger-token-provider';

vi.mock('@/actions/trigger/heal-access-token', () => ({
  healAndSetAccessToken: vi.fn().mockResolvedValue('healed-public-token'),
}));

const baseURL = 'https://trigger.example.com';
const runId = 'run_cmqqgtl5x08lx0hohvv0qembf';

function RunSubscriber({ accessToken }: { accessToken?: string }) {
  const auth = useTriggerAuthContext();
  const client = useApiClient({
    accessToken,
    enabled: Boolean(accessToken || auth.accessToken),
    requestOptions: { retry: { maxAttempts: 1 } },
  });
  useEffect(() => {
    if (client) void client.retrieveRun(runId).catch(() => undefined);
  }, [client]);
  return null;
}

function Dashboard() {
  usePolicyOnboardingStatus(runId);
  useOnboardingStatus(runId, 'risks');
  return <button>Open tasks</button>;
}

afterEach(() => vi.unstubAllGlobals());

beforeEach(() => {
  vi.mocked(healAndSetAccessToken).mockReset().mockResolvedValue('healed-public-token');
});

describe('TriggerTokenProvider availability', () => {
  it('keeps the app visible while token recovery is pending', () => {
    vi.mocked(healAndSetAccessToken).mockImplementation(() => new Promise(() => {}));

    render(
      <TriggerTokenProvider baseURL={baseURL} triggerJobId={runId}>
        <Dashboard />
      </TriggerTokenProvider>,
    );

    expect(screen.getByRole('button', { name: 'Open tasks' })).toBeTruthy();
  });

  it.each(['unavailable', 'rejected'])(
    'keeps the app visible when token recovery is %s',
    async (failure) => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      if (failure === 'rejected') {
        vi.mocked(healAndSetAccessToken).mockRejectedValue(new Error('Trigger is offline'));
      } else {
        vi.mocked(healAndSetAccessToken).mockResolvedValue(null);
      }

      render(
        <TriggerTokenProvider baseURL={baseURL} triggerJobId={runId}>
          <Dashboard />
        </TriggerTokenProvider>,
      );

      await waitFor(() => expect(healAndSetAccessToken).toHaveBeenCalledWith(runId));
      expect(screen.getByRole('button', { name: 'Open tasks' })).toBeTruthy();
      consoleError.mockRestore();
    },
  );
});

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
