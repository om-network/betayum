import { usePermissions } from '@/hooks/use-permissions';
import { apiClient } from '@/lib/api-client';
import {
  ADMIN_PERMISSIONS,
  AUDITOR_PERMISSIONS,
  mockHasPermission,
  setMockPermissions,
} from '@/test-utils/mocks/permissions';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { CodexTerminal } from './CodexTerminal';

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

vi.mock('./CodexTerminalViewport', () => ({
  CodexTerminalViewport: () => <div aria-label="Codex terminal viewport" />,
}));

describe(CodexTerminal.name, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePermissions).mockReturnValue({
      canAccessAuditorView: false,
      customPermissions: {},
      hasPermission: mockHasPermission,
      obligations: {},
      permissions: {},
      roles: ['owner'],
    });
    setMockPermissions(ADMIN_PERMISSIONS);
  });

  it('opens Codex independently from the browser desktop', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { codexStatus: 'disconnected' },
      status: 200,
    });
    vi.mocked(apiClient.post).mockResolvedValue({
      data: {
        id: 'cts_1',
        status: 'ready',
        expiresAt: '2026-07-30T04:00:00.000Z',
        websocketPath: '/v1/integration-browser/codex-sessions/cts_1/terminal',
        error: null,
      },
      status: 201,
    });

    render(<CodexTerminal connectionId="icn_terminal" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open terminal' }));

    expect(await screen.findByLabelText('Codex terminal viewport')).toBeTruthy();
    expect(apiClient.post).toHaveBeenCalledWith(
      '/v1/integration-browser/connections/icn_terminal/codex-sessions',
    );
  });

  it('creates a restricted session before logging Codex out', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { codexStatus: 'connected' },
      status: 200,
    });
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce({
        data: {
          id: 'cts_logout',
          status: 'ready',
          expiresAt: '2026-07-30T04:00:00.000Z',
          websocketPath: '/v1/integration-browser/codex-sessions/cts_logout/terminal',
          error: null,
        },
        status: 201,
      })
      .mockResolvedValueOnce({
        data: { success: true },
        status: 201,
      });

    render(<CodexTerminal connectionId="icn_logout" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenLastCalledWith(
        '/v1/integration-browser/codex-sessions/cts_logout/logout',
      );
    });
    expect(screen.queryByLabelText('Codex terminal viewport')).toBeNull();
  });

  it('hides session mutation actions for auditors while showing connection status', async () => {
    setMockPermissions(AUDITOR_PERMISSIONS);
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { codexStatus: 'connected' },
      status: 200,
    });

    render(<CodexTerminal connectionId="icn_auditor" />);

    expect(await screen.findByText('Connected')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open terminal' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Disconnect' })).toBeNull();
  });
});
