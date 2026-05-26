const mockDb = {
  organization: {
    findUnique: jest.fn(),
  },
  member: {
    findFirst: jest.fn(),
  },
};

jest.mock('@db', () => ({ db: mockDb }));

jest.mock('./auth.server', () => ({
  auth: {
    api: {
      getSession: jest.fn(),
    },
  },
}));

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
import type { ApiKeyService } from './api-key.service';
import type { AuthenticatedRequest } from './types';

type TestAuthenticatedRequest = Omit<
  Partial<AuthenticatedRequest>,
  'headers'
> & {
  headers: Record<string, string | undefined>;
};

function buildContext(
  request: TestAuthenticatedRequest,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request as unknown as AuthenticatedRequest,
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as ExecutionContext;
}

describe('HybridAuthGuard with Clerk auth provider', () => {
  const originalAuthProvider = process.env.AUTH_PROVIDER;
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
    process.env.AUTH_PROVIDER = 'clerk';
    jest.clearAllMocks();
    guard = new HybridAuthGuard(
      apiKeyService,
      reflector,
      clerkRequestAuthService,
    );
  });

  afterAll(() => {
    process.env.AUTH_PROVIDER = originalAuthProvider;
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
    jest.mocked(clerkIdentityService.resolveMappedUser).mockResolvedValueOnce({
      id: 'usr_1',
      email: 'owner@trycomp.ai',
      emailVerified: true,
      name: 'Owner',
      image: null,
      role: 'user',
      clerkUserId: 'clerk_1',
    });
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
    jest.mocked(clerkIdentityService.resolveMappedUser).mockResolvedValueOnce({
      id: 'usr_1',
      email: 'owner@trycomp.ai',
      emailVerified: true,
      name: 'Owner',
      image: null,
      role: 'user',
      clerkUserId: 'clerk_1',
    });

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
    jest.mocked(clerkIdentityService.resolveMappedUser).mockResolvedValueOnce({
      id: 'usr_1',
      email: 'owner@trycomp.ai',
      emailVerified: true,
      name: 'Owner',
      image: null,
      role: 'user',
      clerkUserId: 'clerk_1',
    });
    mockDb.member.findFirst.mockResolvedValueOnce(null);

    await expect(
      guard.canActivate(
        buildContext({
          headers: { authorization: 'Bearer session_token' },
        }),
      ),
    ).rejects.toThrow(UnauthorizedException);
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
});
