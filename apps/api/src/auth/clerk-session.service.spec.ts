const mockCreateRemoteJWKSet = jest.fn();
const mockJwtVerify = jest.fn();

jest.mock('jose', () => ({
  createRemoteJWKSet: (...args: unknown[]) => mockCreateRemoteJWKSet(...args),
  jwtVerify: (...args: unknown[]) => mockJwtVerify(...args),
}));

import { UnauthorizedException } from '@nestjs/common';
import { ClerkSessionService } from './clerk-session.service';

describe('ClerkSessionService', () => {
  const originalEnv = process.env;
  let service: ClerkSessionService;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      CLERK_SECRET_KEY: 'sk_test',
      CLERK_JWT_ISSUER: 'https://test.clerk.accounts.dev',
      CLERK_AUTHORIZED_PARTIES: 'http://localhost:3000',
    };
    delete process.env.CLERK_JWKS_URL;
    jest.clearAllMocks();
    mockCreateRemoteJWKSet.mockReturnValue('jwks');
    service = new ClerkSessionService();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('turns malformed Clerk session cookies into unauthorized errors', async () => {
    await expect(
      service.verifyRequest({ cookie: '__session=abc%' }),
    ).rejects.toThrow(UnauthorizedException);

    expect(mockJwtVerify).not.toHaveBeenCalled();
  });

  it('verifies a valid bearer session token and returns Clerk claims', async () => {
    mockJwtVerify.mockResolvedValueOnce({
      payload: {
        sub: 'clerk_1',
        sid: 'sess_1',
        org_id: 'org_1',
        azp: 'http://localhost:3000',
      },
    });

    await expect(
      service.verifyRequest({ authorization: 'Bearer token' }),
    ).resolves.toEqual({
      clerkUserId: 'clerk_1',
      sessionId: 'sess_1',
      organizationId: 'org_1',
      impersonatedBy: undefined,
    });

    expect(mockJwtVerify).toHaveBeenCalledWith(
      'token',
      'jwks',
      expect.objectContaining({
        issuer: 'https://test.clerk.accounts.dev',
      }),
    );
  });

  it('rejects sessions from an untrusted authorized party', async () => {
    mockJwtVerify.mockResolvedValueOnce({
      payload: {
        sub: 'clerk_1',
        sid: 'sess_1',
        azp: 'https://evil.example',
      },
    });

    await expect(
      service.verifyRequest({ authorization: 'Bearer token' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('accepts E2E test session tokens without Clerk JWKS verification', async () => {
    process.env.E2E_TEST_MODE = 'true';
    const tokenPayload = Buffer.from(
      JSON.stringify({
        clerkUserId: 'clerk_e2e_1',
        sessionId: 'sess_e2e_1',
        organizationId: 'org_e2e_1',
      }),
    ).toString('base64url');

    await expect(
      service.verifyRequest({ cookie: `__session=e2e.${tokenPayload}` }),
    ).resolves.toEqual({
      clerkUserId: 'clerk_e2e_1',
      sessionId: 'sess_e2e_1',
      organizationId: 'org_e2e_1',
    });

    expect(mockJwtVerify).not.toHaveBeenCalled();
  });
});
