import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const headerGetMock = vi.hoisted(() => vi.fn<(name: string) => string | null>());

vi.mock('next/headers', () => ({
  headers: () =>
    Promise.resolve({
      get: headerGetMock,
    }),
}));

vi.mock('@/env.mjs', () => ({
  env: {
    NEXT_PUBLIC_API_URL: 'https://api.test',
  },
}));

const createJsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('serverApi organization header forwarding', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    fetchMock = vi.fn().mockResolvedValue(createJsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    headerGetMock.mockReset();
    headerGetMock.mockImplementation((name: string) => {
      if (name === 'cookie') {
        return 'active_organization_id=org_retired; __session=session_123';
      }
      return null;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not infer X-Organization-Id from the retired active organization cookie', async () => {
    const { serverApi } = await import('./api-server');

    await serverApi.get('/v1/auth/me');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/v1/auth/me',
      expect.objectContaining({
        headers: expect.not.objectContaining({
          'X-Organization-Id': 'org_retired',
        }),
      }),
    );
  });

  it('forwards an explicit organization id from the caller', async () => {
    const { serverApi } = await import('./api-server');

    await serverApi.get('/v1/people', 'org_route');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/v1/people',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Organization-Id': 'org_route',
        }),
      }),
    );
  });
});
