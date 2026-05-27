import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ClerkIdentityService } from './clerk-identity.service';
import { ClerkSessionService } from './clerk-session.service';
import { PlatformAdminGuard } from './platform-admin.guard';

const mockVerifyRequest = jest.fn();
const mockResolveMappedUser = jest.fn();

jest.mock('./clerk-identity.service', () => ({
  ClerkIdentityService: class ClerkIdentityService {},
}));

jest.mock('./clerk-session.service', () => ({
  ClerkSessionService: class ClerkSessionService {},
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

describe('PlatformAdminGuard', () => {
  let guard: PlatformAdminGuard;
  let clerkSessionService: ClerkSessionService;
  let clerkIdentityService: ClerkIdentityService;

  beforeEach(() => {
    jest.clearAllMocks();
    clerkSessionService = {
      verifyRequest: (...args: unknown[]) => mockVerifyRequest(...args),
    } as unknown as ClerkSessionService;
    clerkIdentityService = {
      resolveMappedUser: (...args: unknown[]) => mockResolveMappedUser(...args),
    } as unknown as ClerkIdentityService;
    guard = new PlatformAdminGuard(clerkSessionService, clerkIdentityService);
  });

  it('throws UnauthorizedException when no auth headers are present', async () => {
    const ctx = buildContext({});
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(ctx)).rejects.toThrow(
      'Platform admin routes require authentication',
    );
  });

  it('throws UnauthorizedException when session is invalid', async () => {
    mockVerifyRequest.mockRejectedValue(new UnauthorizedException('Invalid'));
    const ctx = buildContext({ authorization: 'Bearer bad_token' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when session has no user id', async () => {
    mockVerifyRequest.mockRejectedValue(new UnauthorizedException('Invalid'));
    const ctx = buildContext({ cookie: 'session=abc' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when user is not found in DB', async () => {
    mockVerifyRequest.mockResolvedValue({ clerkUserId: 'clerk_1' });
    mockResolveMappedUser.mockRejectedValue(
      new UnauthorizedException('User not found'),
    );
    const ctx = buildContext({ cookie: 'session=abc' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('throws ForbiddenException when user role is not admin', async () => {
    mockVerifyRequest.mockResolvedValue({ clerkUserId: 'clerk_1' });
    mockResolveMappedUser.mockResolvedValue({
      id: 'usr_1',
      email: 'user@test.com',
      role: 'user',
    });
    const ctx = buildContext({ cookie: 'session=abc' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(ctx)).rejects.toThrow(
      'Access denied: Platform admin privileges required',
    );
  });

  it('throws ForbiddenException when user role is null', async () => {
    mockVerifyRequest.mockResolvedValue({ clerkUserId: 'clerk_1' });
    mockResolveMappedUser.mockResolvedValue({
      id: 'usr_1',
      email: 'user@test.com',
      role: null,
    });
    const ctx = buildContext({ cookie: 'session=abc' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('returns true and sets request context for valid admin', async () => {
    mockVerifyRequest.mockResolvedValue({ clerkUserId: 'clerk_admin' });
    mockResolveMappedUser.mockResolvedValue({
      id: 'usr_admin',
      email: 'admin@platform.com',
      role: 'admin',
    });

    const request = {
      headers: { authorization: 'Bearer valid_token' },
      userId: undefined as string | undefined,
      userEmail: undefined as string | undefined,
      isPlatformAdmin: undefined as boolean | undefined,
    };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(request.userId).toBe('usr_admin');
    expect(request.userEmail).toBe('admin@platform.com');
    expect(request.isPlatformAdmin).toBe(true);
  });

  it('always queries the DB even if session contains role info', async () => {
    mockVerifyRequest.mockResolvedValue({ clerkUserId: 'clerk_1' });
    mockResolveMappedUser.mockResolvedValue({
      id: 'usr_1',
      email: 'user@test.com',
      role: 'user',
    });
    const ctx = buildContext({ cookie: 'session=abc' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    expect(mockResolveMappedUser).toHaveBeenCalledWith('clerk_1');
  });

  it('does not allow API key authentication', async () => {
    const ctx = buildContext({ 'x-api-key': 'some_key' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('does not allow service token authentication', async () => {
    const ctx = buildContext({ 'x-service-token': 'some_token' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('forwards authorization header to Clerk verification', async () => {
    mockVerifyRequest.mockResolvedValue({ clerkUserId: 'clerk_admin' });
    mockResolveMappedUser.mockResolvedValue({
      id: 'usr_admin',
      email: 'admin@test.com',
      role: 'admin',
    });
    const ctx = buildContext({ authorization: 'Bearer token123' });

    await guard.canActivate(ctx);

    expect(mockVerifyRequest).toHaveBeenCalledWith({
      authorization: 'Bearer token123',
      cookie: undefined,
    });
  });

  it('forwards cookie header to Clerk verification', async () => {
    mockVerifyRequest.mockResolvedValue({ clerkUserId: 'clerk_admin' });
    mockResolveMappedUser.mockResolvedValue({
      id: 'usr_admin',
      email: 'admin@test.com',
      role: 'admin',
    });
    const ctx = buildContext({ cookie: 'session=xyz' });

    await guard.canActivate(ctx);

    expect(mockVerifyRequest).toHaveBeenCalledWith({
      authorization: undefined,
      cookie: 'session=xyz',
    });
  });
});
