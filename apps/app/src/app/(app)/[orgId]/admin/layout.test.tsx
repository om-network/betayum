import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRedirect = vi.fn();
const mockServerApiGet = vi.fn();

vi.mock('@/utils/auth', async () => {
  const { mockAuth } = await import('@/test-utils/mocks/auth');
  return { auth: mockAuth };
});

vi.mock('@/lib/api-server', () => ({
  serverApi: {
    get: (...args: unknown[]) => mockServerApiGet(...args),
  },
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

const { default: AdminLayout } = await import('./layout');

describe('[orgId]/admin/layout - auth gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockServerApiGet.mockResolvedValue({
      data: { id: 'org_1' },
      error: null,
      status: 200,
    });
  });

  it('redirects to frameworks when user has no session', async () => {
    setupAuthMocks({ session: null, user: null });

    await expect(
      AdminLayout({
        children: null,
        params: Promise.resolve({ orgId: 'org_1' }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(mockRedirect).toHaveBeenCalledWith('/org_1/overview');
  });

  it('redirects to frameworks when the admin API denies access', async () => {
    setupAuthMocks({
      session: createMockSession(),
      user: createMockUser({ role: 'user' }),
    });
    mockServerApiGet.mockResolvedValue({
      data: undefined,
      error: 'Forbidden',
      status: 403,
    });

    await expect(
      AdminLayout({
        children: null,
        params: Promise.resolve({ orgId: 'org_1' }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(mockRedirect).toHaveBeenCalledWith('/org_1/overview');
  });

  it('does not use local user role as the platform admin authority', async () => {
    setupAuthMocks({
      session: createMockSession(),
      user: createMockUser({ role: null }),
    });

    const result = await AdminLayout({
      children: 'admin content',
      params: Promise.resolve({ orgId: 'org_1' }),
    });

    expect(result).toBeTruthy();
    expect(mockServerApiGet).toHaveBeenCalledWith('/v1/admin/organizations/org_1', 'org_1');
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('renders children when user is a platform admin', async () => {
    setupAuthMocks({
      session: createMockSession(),
      user: createMockUser({ role: 'admin' }),
    });

    const result = await AdminLayout({
      children: 'admin content',
      params: Promise.resolve({ orgId: 'org_1' }),
    });

    expect(result).toBeTruthy();
    expect(mockServerApiGet).toHaveBeenCalledWith('/v1/admin/organizations/org_1', 'org_1');
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('delegates stale admin identity denial to the admin API', async () => {
    setupAuthMocks({
      session: createMockSession(),
      user: createMockUser({ role: 'admin' }),
    });
    mockServerApiGet.mockResolvedValue({
      data: undefined,
      error: 'Forbidden',
      status: 403,
    });

    await expect(
      AdminLayout({
        children: null,
        params: Promise.resolve({ orgId: 'org_1' }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    expect(mockRedirect).toHaveBeenCalledWith('/org_1/overview');
  });
});
