jest.mock('./service-token.config', () => ({
  resolveServiceByName: jest.fn(),
}));

jest.mock('@db', () => ({
  db: {
    organizationRole: {
      findMany: jest.fn(),
    },
  },
}));

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { PermissionEvaluatorService } from './permission-evaluator.service';
import { PermissionGuard, type RequiredPermission } from './permission.guard';
import { resolveServiceByName } from './service-token.config';
import type { AuthenticatedRequest } from './types';

type TestRequest = Partial<AuthenticatedRequest> & {
  method: string;
  url: string;
};

function buildContext(request: TestRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request as AuthenticatedRequest,
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as ExecutionContext;
}

describe('PermissionGuard Clerk organization permissions', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;
  const permissionEvaluator = {
    hasPermissions: jest.fn(),
  } as unknown as PermissionEvaluatorService;
  const guard = new PermissionGuard(reflector, permissionEvaluator);

  beforeEach(() => {
    jest.resetAllMocks();
    jest
      .mocked(reflector.getAllAndOverride)
      .mockReturnValue([{ resource: 'control', actions: ['read'] }]);
  });

  function browserSessionRequest(
    overrides: Partial<AuthenticatedRequest> = {},
  ): TestRequest {
    return {
      authType: 'session',
      isApiKey: false,
      isServiceToken: false,
      isPlatformAdmin: false,
      organizationId: 'org_1',
      userRoles: null,
      clerkUserId: 'clerk_1',
      clerkOrganizationId: 'clerk_org_1',
      clerkOrganizationPermissions: ['org:control:read'],
      method: 'GET',
      url: '/v1/controls',
      ...overrides,
    };
  }

  function setRequiredPermissions(permissions: RequiredPermission[]): void {
    jest.mocked(reflector.getAllAndOverride).mockReturnValue(permissions);
  }

  it('allows browser sessions with the required Clerk custom permission', async () => {
    await expect(
      guard.canActivate(buildContext(browserSessionRequest())),
    ).resolves.toBe(true);

    expect(permissionEvaluator.hasPermissions).not.toHaveBeenCalled();
  });

  it('denies browser sessions missing the required Clerk custom permission', async () => {
    setRequiredPermissions([{ resource: 'control', actions: ['delete'] }]);

    await expect(
      guard.canActivate(buildContext(browserSessionRequest())),
    ).rejects.toThrow(ForbiddenException);
    expect(permissionEvaluator.hasPermissions).not.toHaveBeenCalled();
  });

  it('denies browser sessions with missing Clerk permission context', async () => {
    await expect(
      guard.canActivate(
        buildContext(
          browserSessionRequest({
            clerkOrganizationPermissions: undefined,
          }),
        ),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(permissionEvaluator.hasPermissions).not.toHaveBeenCalled();
  });

  it('keeps service token scoped permission checks separate from Clerk', async () => {
    jest.mocked(resolveServiceByName).mockReturnValueOnce({
      name: 'internal-worker',
      envVar: 'SERVICE_TOKEN_TRIGGER',
      permissions: ['control:read'],
    });

    await expect(
      guard.canActivate(
        buildContext({
          authType: 'service',
          isApiKey: false,
          isServiceToken: true,
          serviceName: 'internal-worker',
          isPlatformAdmin: false,
          organizationId: 'org_1',
          userRoles: null,
          method: 'GET',
          url: '/v1/controls',
        }),
      ),
    ).resolves.toBe(true);
    expect(permissionEvaluator.hasPermissions).not.toHaveBeenCalled();
  });

  it('denies service tokens missing their scoped permission', async () => {
    jest.mocked(resolveServiceByName).mockReturnValueOnce({
      name: 'internal-worker',
      envVar: 'SERVICE_TOKEN_TRIGGER',
      permissions: ['risk:read'],
    });

    await expect(
      guard.canActivate(
        buildContext({
          authType: 'service',
          isApiKey: false,
          isServiceToken: true,
          serviceName: 'internal-worker',
          isPlatformAdmin: false,
          organizationId: 'org_1',
          userRoles: null,
          method: 'GET',
          url: '/v1/controls',
        }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows platform admins from the authenticated Clerk request context', async () => {
    await expect(
      guard.canActivate(
        buildContext(
          browserSessionRequest({
            isPlatformAdmin: true,
            clerkOrganizationPermissions: undefined,
          }),
        ),
      ),
    ).resolves.toBe(true);

    expect(permissionEvaluator.hasPermissions).not.toHaveBeenCalled();
  });
});
