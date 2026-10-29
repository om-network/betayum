import { apiClient } from '@/lib/api-client';
import { render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsageClient } from './UsageClient';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn() } }));

describe('UsageClient', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders recorded empty usage without requiring payment setup', () => {
    render(
      <UsageClient organizationId="org_1" initialData={{ subscriptions: [], usageRows: [] }} />,
    );
    expect(screen.getByText('No paid service runs yet.')).toBeInTheDocument();
    expect(apiClient.get).not.toHaveBeenCalled();
    expect(screen.queryByText('Payment method needed')).not.toBeInTheDocument();
  });

  it('scopes fetches to the requested organization and does not turn errors into zero usage', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ error: 'Forbidden', status: 403 });
    render(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <UsageClient organizationId="org_2" />
      </SWRConfig>,
    );
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Unable to load usage'),
    );
    expect(apiClient.get).toHaveBeenCalledWith('/v1/billing/usage', 'org_2');
    expect(screen.queryByText('No paid service runs yet.')).not.toBeInTheDocument();
  });
});
