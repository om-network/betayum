import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ClerkIdentityService } from '../auth/clerk-identity.service';
import { ClerkPlatformAdminService } from '../auth/clerk-platform-admin.service';
import { ClerkSessionService } from '../auth/clerk-session.service';
import { PlatformAdminGuard } from '../auth/platform-admin.guard';

const mockVerifyRequest = jest.fn();
const mockResolveMappedUser = jest.fn();
const mockRequirePlatformAdmin = jest.fn();

jest.mock('../auth/clerk-identity.service', () => ({
  ClerkIdentityService: class ClerkIdentityService {},
}));

jest.mock('../auth/clerk-session.service', () => ({
  ClerkSessionService: class ClerkSessionService {},
}));

jest.mock('../auth/clerk-platform-admin.service', () => ({
  ClerkPlatformAdminService: class ClerkPlatformAdminService {},
}));

function buildContext(
  headers: Record<string, string | undefined> = {},
): ExecutionContext {
  const request = {
    headers,
    userId: undefined,
    userEmail: undefined,
    isPlatformAdmin: undefined,
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('PlatformAdminGuard — runtime rejection scenarios', () => {
  let guard: PlatformAdminGuard;
  let clerkSessionService: ClerkSessionService;
  let clerkIdentityService: ClerkIdentityService;
  let clerkPlatformAdminService: ClerkPlatformAdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    clerkSessionService = {
      verifyRequest: (...args: unknown[]) => mockVerifyRequest(...args),
    } as unknown as ClerkSessionService;
    clerkIdentityService = {
      resolveMappedUser: (...args: unknown[]) => mockResolveMappedUser(...args),
    } as unknown as ClerkIdentityService;
    clerkPlatformAdminService = {
      requirePlatformAdmin: (...args: unknown[]) =>
        mockRequirePlatformAdmin(...args),
    } as unknown as ClerkPlatformAdminService;
    guard = new PlatformAdminGuard(
      clerkSessionService,
      clerkIdentityService,
      clerkPlatformAdminService,
    );
  });

  describe('returns 401 for unauthenticated requests', () => {
    it('rejects requests with no headers at all', async () => {
      const ctx = buildContext({});
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects requests with only x-api-key (admin routes are session-only)', async () => {
      const ctx = buildContext({ 'x-api-key': 'key_test_12345' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockVerifyRequest).not.toHaveBeenCalled();
    });

    it('rejects requests with only x-service-token', async () => {
      const ctx = buildContext({ 'x-service-token': 'svc_test_token' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockVerifyRequest).not.toHaveBeenCalled();
    });

    it('rejects when session cookie is present but session is expired', async () => {
      mockVerifyRequest.mockRejectedValue(
        new UnauthorizedException('Invalid or expired Clerk session'),
      );
      const ctx = buildContext({ cookie: 'session=expired_token' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects when bearer token is present but session is invalid', async () => {
      mockVerifyRequest.mockRejectedValue(new UnauthorizedException('Invalid'));
      const ctx = buildContext({ authorization: 'Bearer invalid' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('returns 403 when Clerk platform admin capability is missing', () => {
    beforeEach(() => {
      mockRequirePlatformAdmin.mockRejectedValue(
        new ForbiddenException(
          'Access denied: Platform admin privileges required',
        ),
      );
    });

    it('rejects a user without Clerk admin metadata even when local role is user', async () => {
      mockVerifyRequest.mockResolvedValue({ clerkUserId: 'clerk_1' });
      mockResolveMappedUser.mockResolvedValue({
        id: 'usr_regular',
        email: 'regular@test.com',
        role: 'user',
      });
      const ctx = buildContext({ cookie: 'session=valid' });

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        'Access denied: Platform admin privileges required',
      );
    });

    it('rejects a user without Clerk admin metadata even when local role is null', async () => {
      mockVerifyRequest.mockResolvedValue({ clerkUserId: 'clerk_1' });
      mockResolveMappedUser.mockResolvedValue({
        id: 'usr_norole',
        email: 'norole@test.com',
        role: null,
      });
      const ctx = buildContext({ cookie: 'session=valid' });

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('rejects a user without Clerk admin metadata even when local role is owner', async () => {
      mockVerifyRequest.mockResolvedValue({ clerkUserId: 'clerk_1' });
      mockResolveMappedUser.mockResolvedValue({
        id: 'usr_owner',
        email: 'owner@test.com',
        role: 'owner',
      });
      const ctx = buildContext({ cookie: 'session=valid' });

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('checks Clerk platform admin metadata after local identity mapping', async () => {
      mockVerifyRequest.mockResolvedValue({ clerkUserId: 'clerk_1' });
      mockResolveMappedUser.mockResolvedValue({
        id: 'usr_sneaky',
        email: 'sneaky@test.com',
        role: 'user',
      });
      const ctx = buildContext({ authorization: 'Bearer valid' });

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
      expect(mockResolveMappedUser).toHaveBeenCalledWith('clerk_1');
      expect(mockRequirePlatformAdmin).toHaveBeenCalledWith('clerk_1');
    });

    it('rejects a user who was deleted between session check and DB lookup', async () => {
      mockVerifyRequest.mockResolvedValue({ clerkUserId: 'clerk_1' });
      mockResolveMappedUser.mockRejectedValue(
        new UnauthorizedException('User not found'),
      );
      const ctx = buildContext({ cookie: 'session=valid' });

      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('allows authenticated platform admin', () => {
    it('succeeds and sets request context from Clerk admin metadata', async () => {
      mockVerifyRequest.mockResolvedValue({
        clerkUserId: 'clerk_admin',
        sessionId: 'sess_admin',
      });
      mockResolveMappedUser.mockResolvedValue({
        id: 'usr_admin',
        email: 'admin@platform.com',
        role: 'user',
      });
      mockRequirePlatformAdmin.mockResolvedValue(undefined);

      const request = {
        headers: { cookie: 'session=admin_session' },
        userId: undefined as string | undefined,
        userEmail: undefined as string | undefined,
        clerkUserId: undefined as string | undefined,
        sessionId: undefined as string | undefined,
        isPlatformAdmin: undefined as boolean | undefined,
      };
      const ctx = {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;

      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
      expect(request.userId).toBe('usr_admin');
      expect(request.userEmail).toBe('admin@platform.com');
      expect(request.clerkUserId).toBe('clerk_admin');
      expect(request.sessionId).toBe('sess_admin');
      expect(request.isPlatformAdmin).toBe(true);
    });
  });
});
