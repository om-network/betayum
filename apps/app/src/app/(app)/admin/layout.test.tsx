import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRedirect = vi.fn();
const mockServerApiGet = vi.fn();
const mockGetActiveOrganizationCookie = vi.fn();

vi.mock('@/utils/auth', async () => {
  const { mockAuth } = await import('@/test-utils/mocks/auth');
  return { auth: mockAuth };
});

vi.mock('@/lib/api-server', () => ({
  serverApi: {
    get: (...args: unknown[]) => mockServerApiGet(...args),
  },
}));

vi.mock('@/lib/active-organization', () => ({
  getActiveOrganizationCookie: () => mockGetActiveOrganizationCookie(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => {
    mockRedirect(...args);
    throw new Error('NEXT_REDIRECT');
  },
}));

import { createMockSession, createMockUser, setupAuthMocks } from '@/test-utils/mocks/auth';

const { default: AdminRedirectLayout } = await import('./layout');

describe('(app)/admin/layout - redirect gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActiveOrganizationCookie.mockResolvedValue(null);
  });

  it('redirects to /auth when user has no session', async () => {
    setupAuthMocks({ session: null, user: null });

    await expect(AdminRedirectLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT');

    expect(mockRedirect).toHaveBeenCalledWith('/auth');
  });

  it('redirects to / when the admin API denies access', async () => {
    setupAuthMocks({
      session: createMockSession(),
      user: createMockUser({ role: 'user' }),
    });
    mockServerApiGet.mockResolvedValue({
      data: undefined,
      error: 'Forbidden',
      status: 403,
    });

    await expect(AdminRedirectLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT');

    expect(mockRedirect).toHaveBeenCalledWith('/');
  });

  it('uses the admin API instead of local user role for authorization', async () => {
    setupAuthMocks({
      session: createMockSession(),
      user: createMockUser({ role: 'user' }),
    });
    mockServerApiGet.mockResolvedValue({
      data: { data: [{ id: 'org_first' }] },
    });

    await expect(AdminRedirectLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT');

    expect(mockServerApiGet).toHaveBeenCalledWith('/v1/admin/organizations');
    expect(mockRedirect).toHaveBeenCalledWith('/org_first/admin');
  });

  it('redirects admin to /{orgId}/admin when org is found', async () => {
    setupAuthMocks({
      session: createMockSession(),
      user: createMockUser({ role: 'admin' }),
    });
    mockServerApiGet.mockResolvedValue({
      data: { data: [{ id: 'org_first' }] },
    });

    await expect(AdminRedirectLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT');

    expect(mockServerApiGet).toHaveBeenCalledWith('/v1/admin/organizations');
    expect(mockRedirect).toHaveBeenCalledWith('/org_first/admin');
  });

  it('prefers the active organization cookie over retired session organization state', async () => {
    setupAuthMocks({
      session: createMockSession({ activeOrganizationId: 'org_retired' }),
      user: createMockUser({ role: 'admin' }),
    });
    mockGetActiveOrganizationCookie.mockResolvedValue('org_second');
    mockServerApiGet.mockResolvedValue({
      data: { data: [{ id: 'org_first' }, { id: 'org_second' }] },
    });

    await expect(AdminRedirectLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT');

    expect(mockRedirect).toHaveBeenCalledWith('/org_second/admin');
  });

  it('redirects admin to / when no orgs found', async () => {
    setupAuthMocks({
      session: createMockSession(),
      user: createMockUser({ role: 'admin' }),
    });
    mockServerApiGet.mockResolvedValue({
      data: { data: [] },
    });

    await expect(AdminRedirectLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT');

    expect(mockRedirect).toHaveBeenCalledWith('/');
  });
});
