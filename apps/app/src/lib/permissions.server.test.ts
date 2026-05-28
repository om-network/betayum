import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockClerkAuth = vi.fn();
const mockServerApiGet = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => mockClerkAuth(),
}));

vi.mock('@/lib/api-server', () => ({
  serverApi: {
    get: (...args: unknown[]) => mockServerApiGet(...args),
  },
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), init),
  },
}));

const {
  resolveCurrentUserPermissions,
  resolveCurrentUserOrganizationContext,
  resolveAuditorViewAccess,
  requireApiPermission,
} = await import('./permissions.server');
const { hasPermission } = await import('./permissions');

describe('permissions.server Clerk authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClerkAuth.mockResolvedValue({
      userId: 'clerk_user_1',
      orgId: 'clerk_org_1',
      orgRole: 'org:member',
      orgPermissions: [],
    });
    mockServerApiGet.mockResolvedValue({
      status: 200,
      data: {
        user: {
          id: 'usr_1',
          email: 'owner@example.com',
          name: 'Owner',
          image: null,
          role: 'user',
        },
        organizations: [
          {
            id: 'org_1',
            clerkOrganizationId: 'clerk_org_1',
            memberRole: 'owner',
          },
        ],
      },
    });
  });

  it('does not grant permissions from local memberRole when Clerk claims deny them', async () => {
    const permissions = await resolveCurrentUserPermissions('org_1');

    expect(permissions).toEqual({});
    expect(hasPermission(permissions ?? {}, 'organization', 'delete')).toBe(false);
  });

  it('rejects a route organization that does not match the active Clerk organization', async () => {
    mockClerkAuth.mockResolvedValueOnce({
      userId: 'clerk_user_1',
      orgId: 'clerk_org_other',
      orgRole: 'org:owner',
      orgPermissions: ['org:organization:delete'],
    });

    await expect(resolveCurrentUserPermissions('org_1')).resolves.toBeNull();
  });

  it('resolves local user and organization ids only after active Clerk org validation', async () => {
    mockClerkAuth.mockResolvedValueOnce({
      userId: 'clerk_user_1',
      orgId: 'clerk_org_1',
      orgRole: 'org:member',
      orgPermissions: ['org:training:read'],
    });

    await expect(resolveCurrentUserOrganizationContext('org_1')).resolves.toEqual({
      organizationId: 'org_1',
      userId: 'usr_1',
      permissions: { training: ['read'] },
    });
  });

  it('uses Clerk role and permission claims for Auditor View access', async () => {
    mockClerkAuth.mockResolvedValue({
      userId: 'clerk_user_1',
      orgId: 'clerk_org_1',
      orgRole: 'org:auditor',
      orgPermissions: [],
    });

    await expect(resolveAuditorViewAccess('org_1')).resolves.toEqual({
      canAccess: true,
      roleString: 'org:auditor',
    });
  });

  it('returns forbidden from API guard when only local owner role exists', async () => {
    const result = await requireApiPermission(new Request('https://example.com'), 'member', 'delete');

    expect(result).toBeInstanceOf(Response);
    expect(result instanceof Response ? result.status : null).toBe(403);
  });
});
