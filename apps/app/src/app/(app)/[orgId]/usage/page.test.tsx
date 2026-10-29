import { serverApi } from '@/lib/api-server';
import { requireRoutePermission } from '@/lib/permissions.server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import UsagePage from './page';

vi.mock('@/lib/api-server', () => ({ serverApi: { get: vi.fn() } }));
vi.mock('@/lib/permissions.server', () => ({ requireRoutePermission: vi.fn() }));
vi.mock('./UsageClient', () => ({ UsageClient: () => null }));

describe('Usage page permissions', () => {
  beforeEach(() => vi.resetAllMocks());
  it('guards and loads the organization in the URL', async () => {
    vi.mocked(serverApi.get).mockResolvedValue({
      data: { subscriptions: [], usageRows: [] },
      status: 200,
    });
    await UsagePage({ params: Promise.resolve({ orgId: 'org_route' }) });
    expect(requireRoutePermission).toHaveBeenCalledWith('usage', 'org_route');
    expect(serverApi.get).toHaveBeenCalledWith('/v1/billing/usage', 'org_route');
  });
  it('does not read usage when route permission is denied', async () => {
    vi.mocked(requireRoutePermission).mockRejectedValue(new Error('No access'));
    await expect(UsagePage({ params: Promise.resolve({ orgId: 'org_other' }) })).rejects.toThrow(
      'No access',
    );
    expect(serverApi.get).not.toHaveBeenCalled();
  });
});
