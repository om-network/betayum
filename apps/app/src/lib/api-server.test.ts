import { afterEach, describe, expect, it, vi } from 'vitest';
import { serverApi } from './api-server';

vi.mock('@/env.mjs', () => ({ env: { NEXT_PUBLIC_API_URL: 'https://api.example.com' } }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ cookie: 'session=test', 'x-organization-id': 'org_active' }),
}));

afterEach(() => vi.unstubAllGlobals());

describe('server API organization context', () => {
  it('overrides the active organization with the requested route organization while forwarding the session', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    await serverApi.get('/v1/billing/usage', 'org_route');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/v1/billing/usage',
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: 'session=test',
          'x-organization-id': 'org_route',
        }),
        cache: 'no-store',
      }),
    );
  });
});
