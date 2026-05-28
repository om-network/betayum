import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ClerkPlatformAdminService } from './clerk-platform-admin.service';

describe('ClerkPlatformAdminService', () => {
  const originalEnv = process.env;
  let fetchSpy: jest.SpiedFunction<typeof fetch>;
  let service: ClerkPlatformAdminService;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      CLERK_SECRET_KEY: 'sk_test',
      CLERK_JWT_ISSUER: 'https://clerk.example.test',
      CLERK_AUTHORIZED_PARTIES: 'https://app.example.test',
    };
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    service = new ClerkPlatformAdminService();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    process.env = originalEnv;
  });

  it('allows users with the Clerk platform admin metadata flag', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'user_1',
          private_metadata: { compAiPlatformAdmin: true },
        }),
        { status: 200 },
      ),
    );

    await expect(service.isPlatformAdmin('user_1')).resolves.toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.clerk.com/v1/users/user_1',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk_test',
        }),
      }),
    );
  });

  it('denies users without the Clerk platform admin metadata flag', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'user_1',
          private_metadata: { compAiPlatformAdmin: false },
        }),
        { status: 200 },
      ),
    );

    await expect(service.isPlatformAdmin('user_1')).resolves.toBe(false);
  });

  it('denies stale or deleted Clerk identities', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 404 }));

    await expect(service.requirePlatformAdmin('user_deleted')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('raises a boundary error for unexpected Clerk responses', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 123 }), { status: 200 }),
    );

    await expect(service.isPlatformAdmin('user_1')).rejects.toThrow(
      BadRequestException,
    );
  });
});
