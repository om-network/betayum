const mockDb = {
  organization: {
    findUnique: jest.fn(),
  },
  member: {
    findFirst: jest.fn(),
  },
  session: {
    findFirst: jest.fn(),
  },
};

jest.mock('@db', () => ({ db: mockDb }));

jest.mock('./service-token.config', () => ({
  resolveServiceByToken: jest.fn(),
}));

jest.mock('@trycompai/auth', () => ({
  statement: {},
}));

jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(),
  jwtVerify: jest.fn(),
}));

import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ApiKeyService } from './api-key.service';
import { ClerkRequestAuthService } from './clerk-request-auth.service';
import type { ClerkIdentityService } from './clerk-identity.service';
import type { ClerkPlatformAdminService } from './clerk-platform-admin.service';
import type { ClerkSessionService } from './clerk-session.service';
import { HybridAuthGuard } from './hybrid-auth.guard';
import type {
  MemberProfileContext,
  MemberProfileResolverService,
} from './member-profile-resolver.service';
import type { OrganizationProfileResolverService } from './organization-profile-resolver.service';
import { resolveServiceByToken } from './service-token.config';
import type { SupportContextService } from './support-context.service';
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

const baseUser = {
  id: 'usr_1',
  email: 'owner@trycomp.ai',
  emailVerified: true,
  name: 'Owner',
  image: null,
  role: 'user',
  clerkUserId: 'clerk_1',
};

const memberProfile: MemberProfileContext = {
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
};

describe('HybridAuthGuard Clerk org boundaries', () => {
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
    jest.resetAllMocks();
    jest.mocked(reflector.getAllAndOverride).mockReturnValue(false);
    jest.mocked(supportContextService.resolve).mockResolvedValue(null);
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

  function mockClerkOrganizationSession(
    profile: MemberProfileContext | null = memberProfile,
  ): void {
    jest.mocked(clerkSessionService.verifyRequest).mockResolvedValueOnce({
      clerkUserId: 'clerk_1',
      sessionId: 'sess_1',
      organizationId: 'clerk_org_1',
      organizationRole: 'org:member',
    });
    jest
      .mocked(clerkIdentityService.resolveMappedUser)
      .mockResolvedValueOnce(baseUser);
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
      .mockResolvedValueOnce(profile);
  }

  it('rejects requests for a different local organization', async () => {
    mockClerkOrganizationSession();

    await expect(
      guard.canActivate(
        buildContext({
          headers: {
            authorization: 'Bearer session_token',
            'x-organization-id': 'org_other',
          },
        }),
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(
      memberProfileResolver.resolveByClerkUserAndOrganization,
    ).not.toHaveBeenCalled();
  });

  it('allows Clerk memberships before a local member profile exists', async () => {
    const request: TestAuthenticatedRequest = {
      headers: { authorization: 'Bearer session_token' },
    };
    mockClerkOrganizationSession(null);

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);

    expect(request).toMatchObject({
      clerkUserId: 'clerk_1',
      clerkOrganizationId: 'clerk_org_1',
      clerkOrganizationRole: 'org:member',
      organizationId: 'org_1',
      userRoles: null,
    });
    expect(request.memberId).toBeUndefined();
    expect(request.memberDepartment).toBeUndefined();
  });

  it('accepts matching legacy organization headers during migration', async () => {
    const request: TestAuthenticatedRequest = {
      headers: {
        authorization: 'Bearer session_token',
        'x-organization-id': 'org_1',
      },
    };
    mockClerkOrganizationSession(null);

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);

    expect(request.organizationId).toBe('org_1');
  });

  it('keeps API key auth ahead of Clerk session auth', async () => {
    jest.mocked(apiKeyService.extractApiKey).mockReturnValueOnce('raw_key');
    jest.mocked(apiKeyService.validateApiKey).mockResolvedValueOnce({
      organizationId: 'org_1',
      scopes: ['control:read'],
      apiKeyId: 'apk_1',
      apiKeyName: 'CI',
    });
    const request = {
      headers: {
        'x-api-key': 'comp_raw_key',
        authorization: 'Bearer session_token',
      },
    };

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);

    expect(clerkSessionService.verifyRequest).not.toHaveBeenCalled();
    expect(
      organizationProfileResolver.requireByClerkOrganizationId,
    ).not.toHaveBeenCalled();
    expect(
      memberProfileResolver.resolveByClerkUserAndOrganization,
    ).not.toHaveBeenCalled();
    expect(request).toMatchObject({ authType: 'api-key', isApiKey: true });
  });

  it('keeps service token auth ahead of Clerk session auth', async () => {
    jest.mocked(resolveServiceByToken).mockReturnValueOnce({
      key: 'trigger',
      definition: {
        name: 'internal-worker',
        envVar: 'SERVICE_TOKEN_TRIGGER',
        permissions: ['control:read'],
      },
    });
    mockDb.organization.findUnique.mockResolvedValueOnce({ id: 'org_1' });
    const request = {
      headers: {
        'x-service-token': 'svc_token',
        'x-organization-id': 'org_1',
        authorization: 'Bearer session_token',
      },
    };

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);

    expect(clerkSessionService.verifyRequest).not.toHaveBeenCalled();
    expect(
      organizationProfileResolver.requireByClerkOrganizationId,
    ).not.toHaveBeenCalled();
    expect(
      memberProfileResolver.resolveByClerkUserAndOrganization,
    ).not.toHaveBeenCalled();
    expect(request).toMatchObject({
      authType: 'service',
      isServiceToken: true,
      serviceName: 'internal-worker',
    });
  });
});
