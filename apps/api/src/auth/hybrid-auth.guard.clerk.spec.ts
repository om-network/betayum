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
import type { ClerkSessionService } from './clerk-session.service';
import { HybridAuthGuard } from './hybrid-auth.guard';
import type {
  MemberProfileContext,
  MemberProfileResolverService,
} from './member-profile-resolver.service';
import type {
  OrganizationProfileContext,
  OrganizationProfileResolverService,
} from './organization-profile-resolver.service';
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

function buildOrganizationProfile({
  id = 'org_1',
  clerkOrganizationId = 'clerk_org_1',
}: {
  id?: string;
  clerkOrganizationId?: string;
} = {}): OrganizationProfileContext {
  return {
    id,
    clerkOrganizationId,
    name: 'Acme',
    slug: 'acme',
  };
}

function buildMemberProfile({
  organizationId = 'org_1',
  clerkOrganizationId = 'clerk_org_1',
}: {
  organizationId?: string;
  clerkOrganizationId?: string;
} = {}): MemberProfileContext {
  return {
    id: 'mem_1',
    organizationId,
    userId: 'usr_1',
    clerkUserId: 'clerk_1',
    clerkOrganizationId,
    clerkMembershipId: 'clerk_mem_1',
    role: 'owner',
    department: 'none',
    isActive: true,
    deactivated: false,
  };
}

describe('HybridAuthGuard with Clerk session auth', () => {
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
  } as unknown as SupportContextService;
  const clerkRequestAuthService = new ClerkRequestAuthService(
    clerkIdentityService,
    clerkSessionService,
    organizationProfileResolver,
    memberProfileResolver,
    supportContextService,
  );

  let guard: HybridAuthGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.session.findFirst.mockResolvedValue(null);
    guard = new HybridAuthGuard(
      apiKeyService,
      reflector,
      clerkRequestAuthService,
    );
  });

  function mockClerkOrganizationSession({
    organizationRole = 'org:member',
    organizationPermissions,
    localOrganizationId = 'org_1',
    memberProfile = buildMemberProfile(),
  }: {
    organizationRole?: string;
    organizationPermissions?: string[];
    localOrganizationId?: string;
    memberProfile?: MemberProfileContext | null;
  } = {}): void {
    jest.mocked(clerkSessionService.verifyRequest).mockResolvedValueOnce({
      clerkUserId: 'clerk_1',
      sessionId: 'sess_1',
      organizationId: 'clerk_org_1',
      organizationRole,
      organizationPermissions,
    });
    jest
      .mocked(clerkIdentityService.resolveMappedUser)
      .mockResolvedValueOnce(baseUser);
    jest
      .mocked(organizationProfileResolver.requireByClerkOrganizationId)
      .mockResolvedValueOnce(
        buildOrganizationProfile({ id: localOrganizationId }),
      );
    jest
      .mocked(memberProfileResolver.resolveByClerkUserAndOrganization)
      .mockResolvedValueOnce(memberProfile);
  }

  it('authenticates a mapped Clerk user and sets request context', async () => {
    const request = { headers: { authorization: 'Bearer session_token' } };
    mockClerkOrganizationSession({
      organizationRole: 'org:admin',
      organizationPermissions: ['org:policy:read'],
    });

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);

    expect(request).toMatchObject({
      clerkUserId: 'clerk_1',
      clerkOrganizationId: 'clerk_org_1',
      clerkOrganizationRole: 'org:admin',
      clerkOrganizationPermissions: ['org:policy:read'],
      userId: 'usr_1',
      userEmail: 'owner@trycomp.ai',
      userRoles: ['owner'],
      memberId: 'mem_1',
      organizationId: 'org_1',
      authType: 'session',
      isApiKey: false,
      isServiceToken: false,
      sessionId: 'sess_1',
      sessionDeviceAgent: false,
    });
    expect(
      memberProfileResolver.resolveByClerkUserAndOrganization,
    ).toHaveBeenCalledWith({
      clerkUserId: 'clerk_1',
      clerkOrganizationId: 'clerk_org_1',
    });
  });

  it('rejects a valid Clerk user without an active organization', async () => {
    jest.mocked(clerkSessionService.verifyRequest).mockResolvedValueOnce({
      clerkUserId: 'clerk_1',
      sessionId: 'sess_1',
    });
    jest
      .mocked(clerkIdentityService.resolveMappedUser)
      .mockResolvedValueOnce(baseUser);

    await expect(
      guard.canActivate(
        buildContext({ headers: { authorization: 'Bearer session_token' } }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a Clerk org session without membership role context', async () => {
    jest.mocked(clerkSessionService.verifyRequest).mockResolvedValueOnce({
      clerkUserId: 'clerk_1',
      sessionId: 'sess_1',
      organizationId: 'clerk_org_1',
    });
    jest
      .mocked(clerkIdentityService.resolveMappedUser)
      .mockResolvedValueOnce(baseUser);

    await expect(
      guard.canActivate(
        buildContext({ headers: { authorization: 'Bearer session_token' } }),
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(
      organizationProfileResolver.requireByClerkOrganizationId,
    ).not.toHaveBeenCalled();
  });

  it('rejects missing or invalid Clerk sessions before identity lookup', async () => {
    jest
      .mocked(clerkSessionService.verifyRequest)
      .mockRejectedValueOnce(new UnauthorizedException('missing auth'));

    await expect(
      guard.canActivate(buildContext({ headers: {} })),
    ).rejects.toThrow(UnauthorizedException);
    expect(clerkIdentityService.resolveMappedUser).not.toHaveBeenCalled();

    jest
      .mocked(clerkSessionService.verifyRequest)
      .mockRejectedValueOnce(new UnauthorizedException('invalid session'));

    await expect(
      guard.canActivate(
        buildContext({ headers: { authorization: 'Bearer bad_session' } }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a Clerk org session without a local organization link', async () => {
    jest.mocked(clerkSessionService.verifyRequest).mockResolvedValueOnce({
      clerkUserId: 'clerk_1',
      sessionId: 'sess_1',
      organizationId: 'clerk_org_missing',
      organizationRole: 'org:member',
    });
    jest
      .mocked(clerkIdentityService.resolveMappedUser)
      .mockResolvedValueOnce(baseUser);
    jest
      .mocked(organizationProfileResolver.requireByClerkOrganizationId)
      .mockRejectedValueOnce(
        new UnauthorizedException(
          'Clerk organization is not linked to a Comp AI organization.',
        ),
      );

    await expect(
      guard.canActivate(
        buildContext({ headers: { authorization: 'Bearer session_token' } }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });
});
