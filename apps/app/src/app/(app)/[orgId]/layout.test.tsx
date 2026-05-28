import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockClerkAuth = vi.fn();
const mockRedirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => mockClerkAuth(),
}));

vi.mock('next/navigation', () => ({
  redirect: (path: string) => mockRedirect(path),
}));

vi.mock('@db/server', async () => {
  const { mockDb } = await import('@/test-utils/mocks/db');
  return { db: mockDb, Role: { auditor: 'auditor' } };
});

vi.mock('@/app/posthog', () => ({
  getFeatureFlags: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/app/s3', () => ({
  s3Client: null,
  APP_AWS_ORG_ASSETS_BUCKET: null,
}));
vi.mock('@/components/trigger-token-provider', () => ({
  TriggerTokenProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const mockServerApiGet = vi.fn();
vi.mock('@/lib/api-server', () => ({
  serverApi: {
    get: (...args: unknown[]) => mockServerApiGet(...args),
  },
}));

const mockResolveCurrentUserPermissions = vi.fn();
vi.mock('@/lib/permissions', () => ({
  canAccessApp: vi.fn().mockReturnValue(true),
  canAccessAuditorViewFromClerk: vi.fn().mockReturnValue(true),
  parseRolesString: (value: string) => value.split(',').map((role) => role.trim()),
}));
vi.mock('@/lib/permissions.server', () => ({
  resolveCurrentUserPermissions: (...args: unknown[]) => mockResolveCurrentUserPermissions(...args),
}));
vi.mock('./components/AppShellWrapper', () => ({
  AppShellWrapper: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('next/dynamic', () => ({
  default: () => () => null,
}));
vi.mock('@aws-sdk/client-s3', () => ({ GetObjectCommand: vi.fn() }));
vi.mock('@/lib/s3-presigner', () => ({ getSignedUrl: vi.fn() }));
vi.mock('@trycompai/analytics', () => ({
  OrganizationIdentifier: () => null,
}));

import { mockDb } from '@/test-utils/mocks/db';

const { default: Layout } = await import('./layout');

describe('organization layout Clerk auth path', () => {
  const requestedOrgId = 'org_requested';

  beforeEach(() => {
    vi.clearAllMocks();
    mockClerkAuth.mockResolvedValue({ userId: 'clerk_user_1' });
    mockResolveCurrentUserPermissions.mockResolvedValue({ app: ['read'] });
    mockDb.organization.findUnique.mockResolvedValue({
      id: requestedOrgId,
      name: 'Requested Org',
      logo: null,
      hasAccess: true,
      onboardingCompleted: true,
    });
    mockDb.onboarding.findFirst.mockResolvedValue(null);
    mockServerApiGet.mockResolvedValue({
      data: {
        user: {
          id: 'usr_1',
          email: 'owner@trycomp.ai',
          name: 'Owner',
          image: null,
          role: 'user',
        },
        organizations: [
          {
            id: requestedOrgId,
            clerkOrganizationId: 'clerk_org_requested',
            name: 'Requested Org',
            logo: null,
            onboardingCompleted: true,
            hasAccess: true,
            createdAt: '2026-01-01T00:00:00.000Z',
            memberRole: 'owner',
            memberId: 'mem_1',
          },
        ],
      },
      status: 200,
    });
  });

  it('redirects signed-out users to Clerk sign-in', async () => {
    mockClerkAuth.mockResolvedValueOnce({ userId: null });

    await expect(
      Layout({ children: null, params: Promise.resolve({ orgId: requestedOrgId }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/auth');
  });

  it('renders after API validates organization membership', async () => {
    await expect(
      Layout({ children: null, params: Promise.resolve({ orgId: requestedOrgId }) }),
    ).resolves.toBeDefined();

    expect(mockServerApiGet).toHaveBeenCalledWith('/v1/auth/me');
    expect(mockResolveCurrentUserPermissions).toHaveBeenCalledWith(requestedOrgId);
    expect(mockDb.member.findFirst).not.toHaveBeenCalled();
  });

  it('rejects users who do not belong to the requested organization', async () => {
    mockServerApiGet.mockResolvedValueOnce({
      data: {
        user: { id: 'usr_1', email: 'owner@trycomp.ai', name: 'Owner' },
        organizations: [],
      },
      status: 200,
    });

    await expect(
      Layout({ children: null, params: Promise.resolve({ orgId: requestedOrgId }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/auth/unauthorized');
  });

  it('rejects users whose active Clerk organization does not match the route', async () => {
    mockResolveCurrentUserPermissions.mockResolvedValueOnce(null);

    await expect(
      Layout({ children: null, params: Promise.resolve({ orgId: requestedOrgId }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/auth/unauthorized');
  });

  it('keeps read-only users on the API-authorized route path', async () => {
    mockServerApiGet.mockResolvedValueOnce({
      data: {
        user: {
          id: 'usr_1',
          email: 'auditor@trycomp.ai',
          name: 'Auditor',
          image: null,
          role: 'user',
        },
        organizations: [
          {
            id: requestedOrgId,
            clerkOrganizationId: 'clerk_org_requested',
            name: 'Requested Org',
            logo: null,
            onboardingCompleted: true,
            hasAccess: true,
            createdAt: '2026-01-01T00:00:00.000Z',
            memberRole: 'auditor',
            memberId: 'mem_1',
          },
        ],
      },
      status: 200,
    });

    await expect(
      Layout({ children: null, params: Promise.resolve({ orgId: requestedOrgId }) }),
    ).resolves.toBeDefined();
    expect(mockResolveCurrentUserPermissions).toHaveBeenCalledWith(requestedOrgId);
  });
});
