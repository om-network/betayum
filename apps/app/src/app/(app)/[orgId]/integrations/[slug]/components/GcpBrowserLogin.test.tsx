import { usePermissions } from '@/hooks/use-permissions';
import { apiClient } from '@/lib/api-client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { BrowserLogin } from './GcpBrowserLogin';

vi.mock('@/env.mjs', () => ({
  env: { NEXT_PUBLIC_API_URL: 'https://api.betayum.test' },
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('@novnc/novnc', () => ({
  default: class MockRfb {
    background = '';
    focusOnClick = false;
    resizeSession = false;
    scaleViewport = false;

    addEventListener() {}
    disconnect() {}
  },
}));

describe(BrowserLogin.name, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePermissions).mockReturnValue({
      canAccessAuditorView: false,
      customPermissions: {},
      hasPermission: () => true,
      obligations: {},
      permissions: {},
      roles: ['owner'],
    });
  });

  it('opens the organization desktop and saves the confirmed session', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        vmState: 'not_created',
        lastConfirmedAt: null,
      },
      status: 200,
    });
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce({
        data: {
          id: 'bvs_1',
          status: 'ready',
          expiresAt: '2026-07-29T04:00:00.000Z',
          websocketPath: '/v1/integration-browser/viewer-sessions/bvs_1/vnc',
          error: null,
        },
        status: 201,
      })
      .mockResolvedValueOnce({
        data: {
          id: 'bvs_1',
          status: 'completed',
          expiresAt: '2026-07-29T04:00:00.000Z',
          websocketPath: null,
          error: null,
        },
        status: 201,
      });

    render(<BrowserLogin connectionId="icn_2" providerName="GitHub" />);
    expect(
      screen.getByText("GitHub login saved in this organization's VM browser"),
    ).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Open desktop' }));

    expect(
      await screen.findByLabelText('Organization browser desktop'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save session' }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenLastCalledWith(
        '/v1/integration-browser/viewer-sessions/bvs_1/complete',
      );
    });
    await waitFor(() => {
      expect(screen.queryByLabelText('Organization browser desktop')).toBeNull();
    });
  });

});
