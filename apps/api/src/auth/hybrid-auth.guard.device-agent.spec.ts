const mockDb = {
  organization: { findUnique: jest.fn() },
  member: { findFirst: jest.fn() },
  session: { findFirst: jest.fn() },
};

jest.mock('@db', () => ({ db: mockDb }));

jest.mock('./service-token.config', () => ({
  resolveServiceByToken: jest.fn(),
}));

jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(),
  jwtVerify: jest.fn(),
}));

jest.mock('@trycompai/auth', () => ({
  statement: {},
}));

import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ApiKeyService } from './api-key.service';
import { ClerkIdentityService } from './clerk-identity.service';
import type { ClerkPlatformAdminService } from './clerk-platform-admin.service';
import { ClerkRequestAuthService } from './clerk-request-auth.service';
import { ClerkSessionService } from './clerk-session.service';
import { HybridAuthGuard } from './hybrid-auth.guard';
import { MemberProfileResolverService } from './member-profile-resolver.service';
import { OrganizationProfileResolverService } from './organization-profile-resolver.service';
import { SupportContextService } from './support-context.service';
import type { AuthenticatedRequest } from './types';

type TestAuthenticatedRequest = Omit<
  Partial<AuthenticatedRequest>,
  'headers'
> & {
  headers: Record<string, string | undefined>;
};

function buildContext(request: TestAuthenticatedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request as unknown as AuthenticatedRequest,
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as ExecutionContext;
}

describe('HybridAuthGuard device-agent sessions', () => {
  const apiKeyService = {
    extractApiKey: jest.fn(),
    validateApiKey: jest.fn(),
  } as unknown as ApiKeyService;
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(false),
  } as unknown as Reflector;
  const clerkIdentityService = {
    resolveMappedUser: jest.fn(),
  } as unknown as ClerkIdentityService;
  const clerkSessionService = {
    verifyRequest: jest.fn(),
  } as unknown as ClerkSessionService;
  const organizationProfileResolver = {
    requireByClerkOrganizationId: jest.fn(),
  } as unknown as OrganizationProfileResolverService;
  const memberProfileResolver = {
    resolveByClerkUserAndOrganization: jest.fn(),
  } as unknown as MemberProfileResolverService;
  const supportContextService = {
    resolve: jest.fn().mockResolvedValue(null),
    resolveCookieValue: jest.fn().mockReturnValue(null),
  } as unknown as SupportContextService;
  const clerkPlatformAdminService = {
    isPlatformAdmin: jest.fn().mockResolvedValue(false),
  } as unknown as ClerkPlatformAdminService;
  const clerkRequestAuthService = new ClerkRequestAuthService(
    clerkIdentityService,
    clerkSessionService,
    organizationProfileResolver,
    memberProfileResolver,
    supportContextService,
    clerkPlatformAdminService,
  );

  let guard: HybridAuthGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(supportContextService.resolveCookieValue).mockReturnValue(null);
    jest
      .mocked(clerkPlatformAdminService.isPlatformAdmin)
      .mockResolvedValue(false);
    mockDb.session.findFirst.mockResolvedValue(null);
    guard = new HybridAuthGuard(
      apiKeyService,
      reflector,
      clerkRequestAuthService,
    );
  });

  it('authenticates device-agent bearer sessions without Clerk verification', async () => {
    const request = { headers: { authorization: 'Bearer agent_token' } };
    jest
      .mocked(reflector.getAllAndOverride)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    mockDb.session.findFirst.mockResolvedValueOnce({
      id: 'ses_agent',
      userId: 'usr_1',
      user: {
        email: 'employee@trycomp.ai',
        role: 'admin',
      },
    });

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);

    expect(clerkSessionService.verifyRequest).not.toHaveBeenCalled();
    expect(request).toMatchObject({
      authType: 'session',
      userId: 'usr_1',
      userEmail: 'employee@trycomp.ai',
      sessionId: 'ses_agent',
      sessionDeviceAgent: true,
      isPlatformAdmin: false,
      organizationId: '',
    });
  });

  it('falls through to Clerk for ordinary bearer tokens', async () => {
    const request: TestAuthenticatedRequest = {
      headers: {
        authorization: 'Bearer clerk_token',
        'x-organization-id': 'org_1',
      },
    };
    jest.mocked(clerkSessionService.verifyRequest).mockResolvedValueOnce({
      clerkUserId: 'clerk_1',
      sessionId: 'sess_1',
      organizationId: 'clerk_org_1',
      organizationRole: 'org:admin',
    });
    jest.mocked(clerkIdentityService.resolveMappedUser).mockResolvedValueOnce({
      id: 'usr_1',
      email: 'owner@trycomp.ai',
      emailVerified: true,
      name: 'Owner',
      image: null,
      role: 'user',
      clerkUserId: 'clerk_1',
    });
    jest
      .mocked(organizationProfileResolver.requireByClerkOrganizationId)
      .mockResolvedValueOnce({
        id: 'org_1',
        clerkOrganizationId: 'clerk_org_1',
        name: 'Acme',
        slug: 'acme',
      });
    jest
      .mocked(memberProfileResolver.resolveByClerkUserAndOrganization)
      .mockResolvedValueOnce({
        id: 'mem_1',
        organizationId: 'org_1',
        userId: 'usr_1',
        clerkUserId: 'clerk_1',
        clerkOrganizationId: 'clerk_org_1',
        clerkMembershipId: 'clerk_mem_1',
        role: 'owner',
        department: 'none',
        isActive: true,
        deactivated: false,
      });

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);

    expect(clerkSessionService.verifyRequest).toHaveBeenCalledWith({
      authorization: 'Bearer clerk_token',
      cookie: undefined,
    });
    expect(request.sessionDeviceAgent).toBe(false);
  });
});
