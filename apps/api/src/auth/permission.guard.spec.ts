import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionEvaluatorService } from './permission-evaluator.service';
import { PermissionGuard, PERMISSIONS_KEY } from './permission.guard';

jest.mock('@db', () => ({
  db: {
    organizationRole: {
      findMany: jest.fn(),
    },
  },
}));

// Mock @trycompai/auth to avoid ESM issues with better-auth
jest.mock('@trycompai/auth', () => ({
  BUILT_IN_ROLE_PERMISSIONS: {},
  parseRolePermissions: jest.fn(),
  RESTRICTED_ROLES: ['employee', 'contractor'],
  PRIVILEGED_ROLES: ['owner', 'admin', 'auditor'],
}));

describe('PermissionGuard', () => {
  let guard: PermissionGuard;
  let reflector: Reflector;
  const mockHasPermissions = jest.fn();

  const createMockExecutionContext = (
    request: Partial<{
      isApiKey: boolean;
      apiKeyScopes: string[] | undefined;
      userRoles: string[] | null;
      organizationId: string;
      method: string;
      url: string;
    }>,
  ): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          isApiKey: false,
          apiKeyScopes: undefined,
          userRoles: null,
          organizationId: 'org_123',
          method: 'GET',
          url: '/v1/test',
          ...request,
        }),
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionGuard,
        Reflector,
        {
          provide: PermissionEvaluatorService,
          useValue: { hasPermissions: mockHasPermissions },
        },
      ],
    }).compile();

    guard = module.get<PermissionGuard>(PermissionGuard);
    reflector = module.get<Reflector>(Reflector);
    mockHasPermissions.mockReset();
  });

  describe('canActivate', () => {
    it('should allow access when no permissions are required', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const context = createMockExecutionContext({});
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should allow access for legacy API keys with empty scopes before deprecation date', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-04-19T23:59:59Z'));

      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([{ resource: 'control', actions: ['delete'] }]);

      const context = createMockExecutionContext({
        isApiKey: true,
        apiKeyScopes: [],
        method: 'GET',
        url: '/v1/controls',
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);

      jest.useRealTimers();
    });

    it('should deny access for legacy API keys with empty scopes after deprecation date', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-04-20T00:00:00Z'));

      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([{ resource: 'control', actions: ['read'] }]);

      const context = createMockExecutionContext({
        isApiKey: true,
        apiKeyScopes: [],
        method: 'GET',
        url: '/v1/controls',
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );

      jest.useRealTimers();
    });

    it('should deny access for legacy API keys with undefined scopes after deprecation date', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-05-01T00:00:00Z'));

      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([{ resource: 'control', actions: ['read'] }]);

      const context = createMockExecutionContext({
        isApiKey: true,
        apiKeyScopes: undefined,
        method: 'GET',
        url: '/v1/controls',
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );

      jest.useRealTimers();
    });

    it('should allow access for API keys with matching scopes', async () => {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([{ resource: 'control', actions: ['read'] }]);

      const context = createMockExecutionContext({
        isApiKey: true,
        apiKeyScopes: ['control:read'],
        method: 'GET',
        url: '/v1/controls',
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should deny access for API keys with non-matching scopes', async () => {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([{ resource: 'control', actions: ['read'] }]);

      const context = createMockExecutionContext({
        isApiKey: true,
        apiKeyScopes: ['risk:read'],
        method: 'GET',
        url: '/v1/controls',
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should deny access when evaluator returns false', async () => {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([{ resource: 'control', actions: ['delete'] }]);

      mockHasPermissions.mockResolvedValue(false);

      const context = createMockExecutionContext({ userRoles: ['auditor'] });

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockHasPermissions).toHaveBeenCalledWith({
        organizationId: 'org_123',
        roles: ['auditor'],
        permissions: { control: ['delete'] },
      });
    });

    it('should allow access when evaluator returns true', async () => {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([{ resource: 'control', actions: ['delete'] }]);

      mockHasPermissions.mockResolvedValue(true);
      const context = createMockExecutionContext({ userRoles: ['admin'] });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(mockHasPermissions).toHaveBeenCalledWith({
        organizationId: 'org_123',
        roles: ['admin'],
        permissions: { control: ['delete'] },
      });
    });

    it('should merge duplicate resources before checking permissions', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
        { resource: 'control', actions: ['read'] },
        { resource: 'control', actions: ['update', 'read'] },
      ]);

      mockHasPermissions.mockResolvedValue(true);
      const context = createMockExecutionContext({ userRoles: ['admin'] });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(mockHasPermissions).toHaveBeenCalledWith({
        organizationId: 'org_123',
        roles: ['admin'],
        permissions: { control: ['read', 'update'] },
      });
    });

    it('should deny access when evaluator throws', async () => {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([{ resource: 'control', actions: ['delete'] }]);

      mockHasPermissions.mockRejectedValue(new Error('evaluator error'));
      const context = createMockExecutionContext({ userRoles: ['admin'] });

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('isRestrictedRole', () => {
    it('should return true for employee role', () => {
      expect(PermissionGuard.isRestrictedRole(['employee'])).toBe(true);
    });

    it('should return true for contractor role', () => {
      expect(PermissionGuard.isRestrictedRole(['contractor'])).toBe(true);
    });

    it('should return false for admin role', () => {
      expect(PermissionGuard.isRestrictedRole(['admin'])).toBe(false);
    });

    it('should return false for owner role', () => {
      expect(PermissionGuard.isRestrictedRole(['owner'])).toBe(false);
    });

    it('should return false for auditor role', () => {
      expect(PermissionGuard.isRestrictedRole(['auditor'])).toBe(false);
    });

    it('should return false if user has both employee and admin roles', () => {
      expect(PermissionGuard.isRestrictedRole(['employee', 'admin'])).toBe(
        false,
      );
    });

    it('should return true for null roles', () => {
      expect(PermissionGuard.isRestrictedRole(null)).toBe(true);
    });

    it('should return true for empty roles array', () => {
      expect(PermissionGuard.isRestrictedRole([])).toBe(true);
    });
  });
});
