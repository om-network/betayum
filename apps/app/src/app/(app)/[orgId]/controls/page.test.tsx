import { serverApi } from '@/lib/api-server';
import { resolveCurrentUserPermissions } from '@/lib/permissions.server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ControlsPage from './page';

vi.mock('@/lib/api-server', () => ({ serverApi: { get: vi.fn() } }));
vi.mock('@/lib/permissions.server', () => ({ resolveCurrentUserPermissions: vi.fn() }));
vi.mock('./components/CreateControlSheet', () => ({ CreateControlSheet: () => null }));
vi.mock('./components/controls-table', () => ({ ControlsTable: () => null }));

describe('ControlsPage', () => {
  beforeEach(() => vi.clearAllMocks());
  it('loads the selected server page for the URL organization for a read-only user', async () => {
    vi.mocked(resolveCurrentUserPermissions).mockResolvedValue({ control: ['read'] });
    vi.mocked(serverApi.get).mockResolvedValue({ data: { data: [], pageCount: 3 }, status: 200 });
    await ControlsPage({
      params: Promise.resolve({ orgId: 'org_2' }),
      searchParams: Promise.resolve({ page: '2', perPage: '50', name: 'Access' }),
    });
    expect(serverApi.get).toHaveBeenCalledTimes(1);
    expect(serverApi.get).toHaveBeenCalledWith(
      '/v1/controls?page=2&perPage=50&name=Access&sortDesc=false&sortBy=name',
      'org_2',
    );
  });
  it('loads creation options only for users allowed to create controls', async () => {
    vi.mocked(resolveCurrentUserPermissions).mockResolvedValue({ control: ['read', 'create'] });
    vi.mocked(serverApi.get).mockResolvedValue({ data: { data: [], pageCount: 1 }, status: 200 });
    await ControlsPage({
      params: Promise.resolve({ orgId: 'org_1' }),
      searchParams: Promise.resolve({}),
    });
    expect(serverApi.get).toHaveBeenCalledWith('/v1/controls/options', 'org_1');
  });
  it('does not disguise an API failure as an empty control list', async () => {
    vi.mocked(resolveCurrentUserPermissions).mockResolvedValue({ control: ['read'] });
    vi.mocked(serverApi.get).mockResolvedValue({ error: 'Unavailable', status: 503 });
    await expect(
      ControlsPage({
        params: Promise.resolve({ orgId: 'org_1' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow('Unable to load controls');
  });
});
