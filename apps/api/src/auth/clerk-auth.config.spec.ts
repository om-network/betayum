import {
  getClerkAuthConfig,
  validateClerkAuthConfig,
} from './clerk-auth.config';

describe('Clerk auth config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.CLERK_JWT_ISSUER;
    delete process.env.CLERK_AUTHORIZED_PARTIES;
    delete process.env.CLERK_JWKS_URL;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('fails fast when issuer is missing', () => {
    process.env.CLERK_SECRET_KEY = 'sk_test';
    process.env.CLERK_AUTHORIZED_PARTIES = 'http://localhost:3000';

    expect(() => validateClerkAuthConfig()).toThrow(
      'CLERK_JWT_ISSUER is required for Clerk authentication.',
    );
  });

  it('fails fast when secret key is missing', () => {
    process.env.CLERK_JWT_ISSUER = 'https://test.clerk.accounts.dev';
    process.env.CLERK_AUTHORIZED_PARTIES = 'http://localhost:3000';

    expect(() => validateClerkAuthConfig()).toThrow(
      'CLERK_SECRET_KEY is required for Clerk authentication.',
    );
  });

  it('fails fast when authorized parties are missing', () => {
    process.env.CLERK_SECRET_KEY = 'sk_test';
    process.env.CLERK_JWT_ISSUER = 'https://test.clerk.accounts.dev';

    expect(() => validateClerkAuthConfig()).toThrow(
      'CLERK_AUTHORIZED_PARTIES is required for Clerk authentication.',
    );
  });

  it('checks issuer after secret key is present', () => {
    process.env.CLERK_SECRET_KEY = 'sk_test';
    process.env.CLERK_AUTHORIZED_PARTIES = 'http://localhost:3000';

    expect(() => validateClerkAuthConfig()).toThrow(
      'CLERK_JWT_ISSUER is required for Clerk authentication.',
    );
  });

  it('parses Clerk auth config when required env is present', () => {
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
    process.env.CLERK_SECRET_KEY = 'sk_test';
    process.env.CLERK_JWT_ISSUER = 'https://test.clerk.accounts.dev';
    process.env.CLERK_AUTHORIZED_PARTIES = 'http://localhost:3000';
    process.env.CLERK_JWKS_URL = 'not a url';

    expect(() => validateClerkAuthConfig()).toThrow(
      'CLERK_JWKS_URL must be a valid URL for Clerk authentication.',
    );
  });
});
