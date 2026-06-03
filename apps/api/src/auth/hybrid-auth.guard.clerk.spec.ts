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
import { ClerkIdentityService } from './clerk-identity.service';
import { ClerkRequestAuthService } from './clerk-request-auth.service';
import { ClerkSessionService } from './clerk-session.service';
import { HybridAuthGuard } from './hybrid-auth.guard';
import { resolveServiceByToken } from './service-token.config';
import type { ApiKeyService } from './api-key.service';
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
  const clerkRequestAuthService = new ClerkRequestAuthService(
    clerkIdentityService,
    clerkSessionService,
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

  it('authenticates a mapped Clerk user and sets request context', async () => {
    const request = {
      headers: {
        authorization: 'Bearer session_token',
        'x-organization-id': 'org_1',
      },
    };
    jest.mocked(clerkSessionService.verifyRequest).mockResolvedValueOnce({
      clerkUserId: 'clerk_1',
      sessionId: 'sess_1',
    });
    jest
      .mocked(clerkIdentityService.resolveMappedUser)
      .mockResolvedValueOnce(baseUser);
    mockDb.member.findFirst.mockResolvedValueOnce({
      id: 'mem_1',
      role: 'owner',
      department: 'none',
    });

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);

    expect(request).toMatchObject({
      userId: 'usr_1',
      userEmail: 'owner@trycomp.ai',
      userRoles: ['owner'],
      organizationId: 'org_1',
      authType: 'session',
      isApiKey: false,
      isServiceToken: false,
      sessionId: 'sess_1',
      sessionDeviceAgent: false,
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
        buildContext({
          headers: { authorization: 'Bearer session_token' },
        }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a Clerk user who is not an active member of the org', async () => {
    jest.mocked(clerkSessionService.verifyRequest).mockResolvedValueOnce({
      clerkUserId: 'clerk_1',
      sessionId: 'sess_1',
      organizationId: 'org_1',
    });
    jest
      .mocked(clerkIdentityService.resolveMappedUser)
      .mockResolvedValueOnce(baseUser);
    mockDb.member.findFirst.mockResolvedValueOnce(null);

    await expect(
      guard.canActivate(
        buildContext({
          headers: { authorization: 'Bearer session_token' },
        }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects missing auth before identity lookup', async () => {
    jest
      .mocked(clerkSessionService.verifyRequest)
      .mockRejectedValueOnce(new UnauthorizedException('missing auth'));

    await expect(
      guard.canActivate(buildContext({ headers: {} })),
    ).rejects.toThrow(UnauthorizedException);
    expect(clerkIdentityService.resolveMappedUser).not.toHaveBeenCalled();
  });

  it('rejects invalid Clerk sessions', async () => {
    jest
      .mocked(clerkSessionService.verifyRequest)
      .mockRejectedValueOnce(new UnauthorizedException('invalid session'));

    await expect(
      guard.canActivate(
        buildContext({ headers: { authorization: 'Bearer bad_session' } }),
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(clerkIdentityService.resolveMappedUser).not.toHaveBeenCalled();
  });

  it('rejects deactivated members through the active-member lookup', async () => {
    jest.mocked(clerkSessionService.verifyRequest).mockResolvedValueOnce({
      clerkUserId: 'clerk_1',
      sessionId: 'sess_1',
      organizationId: 'org_1',
    });
    jest
      .mocked(clerkIdentityService.resolveMappedUser)
      .mockResolvedValueOnce(baseUser);
    mockDb.member.findFirst.mockResolvedValueOnce(null);

    await expect(
      guard.canActivate(
        buildContext({
          headers: { authorization: 'Bearer session_token' },
        }),
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(mockDb.member.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'usr_1',
          organizationId: 'org_1',
          deactivated: false,
        },
      }),
    );
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
    expect(request).toMatchObject({
      organizationId: 'org_1',
      authType: 'api-key',
      isApiKey: true,
      apiKeyId: 'apk_1',
    });
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
    expect(request).toMatchObject({
      organizationId: 'org_1',
      authType: 'service',
      isApiKey: false,
      isServiceToken: true,
      serviceName: 'internal-worker',
    });
  });
});
