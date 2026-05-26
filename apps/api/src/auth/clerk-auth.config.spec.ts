import {
  getClerkAuthConfig,
  isClerkAuthProvider,
  validateClerkAuthConfig,
} from './clerk-auth.config';

describe('Clerk auth config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.AUTH_PROVIDER;
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.CLERK_JWT_ISSUER;
    delete process.env.CLERK_AUTHORIZED_PARTIES;
    delete process.env.CLERK_JWKS_URL;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('does not require Clerk env when Clerk auth is disabled', () => {
    expect(isClerkAuthProvider()).toBe(false);
    expect(() => validateClerkAuthConfig()).not.toThrow();
  });

  it('fails fast when Clerk auth is enabled without issuer', () => {
    process.env.AUTH_PROVIDER = 'clerk';
    process.env.CLERK_SECRET_KEY = 'sk_test';
    process.env.CLERK_AUTHORIZED_PARTIES = 'http://localhost:3000';

    expect(() => validateClerkAuthConfig()).toThrow(
      'CLERK_JWT_ISSUER is required when AUTH_PROVIDER=clerk.',
    );
  });

  it('fails fast when Clerk auth is enabled without secret key', () => {
    process.env.AUTH_PROVIDER = 'clerk';
    process.env.CLERK_JWT_ISSUER = 'https://test.clerk.accounts.dev';
    process.env.CLERK_AUTHORIZED_PARTIES = 'http://localhost:3000';

    expect(() => validateClerkAuthConfig()).toThrow(
      'CLERK_SECRET_KEY is required when AUTH_PROVIDER=clerk.',
    );
  });

  it('fails fast when Clerk auth is enabled without authorized parties', () => {
    process.env.AUTH_PROVIDER = 'clerk';
    process.env.CLERK_SECRET_KEY = 'sk_test';
    process.env.CLERK_JWT_ISSUER = 'https://test.clerk.accounts.dev';

    expect(() => validateClerkAuthConfig()).toThrow(
      'CLERK_AUTHORIZED_PARTIES is required when AUTH_PROVIDER=clerk.',
    );
  });

  it('checks issuer after secret key is present', () => {
    process.env.AUTH_PROVIDER = 'clerk';
    process.env.CLERK_SECRET_KEY = 'sk_test';
    process.env.CLERK_AUTHORIZED_PARTIES = 'http://localhost:3000';

    expect(() => validateClerkAuthConfig()).toThrow(
      'CLERK_JWT_ISSUER is required when AUTH_PROVIDER=clerk.',
    );
  });

  it('parses Clerk auth config when required env is present', () => {
    process.env.AUTH_PROVIDER = 'clerk';
    process.env.CLERK_SECRET_KEY = 'sk_test';
    process.env.CLERK_JWT_ISSUER = 'https://test.clerk.accounts.dev';
    process.env.CLERK_AUTHORIZED_PARTIES =
      'http://localhost:3000, https://app.trycomp.ai';

    expect(getClerkAuthConfig()).toEqual({
      secretKey: 'sk_test',
      issuer: 'https://test.clerk.accounts.dev',
      authorizedParties: ['http://localhost:3000', 'https://app.trycomp.ai'],
      jwksUrl: 'https://api.clerk.com/v1/jwks',
    });
  });

  it('rejects an invalid custom JWKS URL', () => {
    process.env.AUTH_PROVIDER = 'clerk';
    process.env.CLERK_SECRET_KEY = 'sk_test';
    process.env.CLERK_JWT_ISSUER = 'https://test.clerk.accounts.dev';
    process.env.CLERK_AUTHORIZED_PARTIES = 'http://localhost:3000';
    process.env.CLERK_JWKS_URL = 'not a url';

    expect(() => validateClerkAuthConfig()).toThrow(
      'CLERK_JWKS_URL must be a valid URL when AUTH_PROVIDER=clerk.',
    );
  });
});
