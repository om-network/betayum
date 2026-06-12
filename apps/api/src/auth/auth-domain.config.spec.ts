import {
  deriveCookieDomain,
  getConfiguredTrustedOrigins,
  isTrustedStaticOrigin,
  shouldUseStagingCookiePrefix,
} from './auth-domain.config';

describe('auth domain configuration', () => {
  it('derives production and staging cookie domains from the API base URL', () => {
    expect(deriveCookieDomain({ baseUrl: 'https://api.betayum.com' })).toBe(
      '.betayum.com',
    );
    expect(
      deriveCookieDomain({ baseUrl: 'https://api.staging.betayum.com' }),
    ).toBe('.staging.betayum.com');
  });

  it('prefers an explicit cookie domain and leaves localhost unscoped', () => {
    expect(
      deriveCookieDomain({
        baseUrl: 'https://api.betayum.com',
        explicitCookieDomain: '.sessions.betayum.com',
      }),
    ).toBe('.sessions.betayum.com');
    expect(deriveCookieDomain({ baseUrl: 'http://localhost:3333' })).toBe(
      undefined,
    );
  });

  it('uses staging cookie prefix for configured staging domains only', () => {
    expect(
      shouldUseStagingCookiePrefix({
        cookieDomain: '.staging.betayum.com',
        stagingDomain: 'staging.betayum.com',
      }),
    ).toBe(true);
    expect(
      shouldUseStagingCookiePrefix({
        cookieDomain: '.betayum.com',
        stagingDomain: 'staging.betayum.com',
      }),
    ).toBe(false);
  });

  it('builds trusted origins from Cloud Run domain configuration and localhost defaults', () => {
    expect(
      getConfiguredTrustedOrigins({
        primaryDomain: 'betayum.com',
        stagingDomain: 'staging.betayum.com',
      }),
    ).toEqual(
      expect.arrayContaining([
        'http://localhost:3000',
        'http://localhost:3333',
        'https://app.betayum.com',
        'https://api.betayum.com',
        'https://portal.betayum.com',
        'https://app.staging.betayum.com',
        'https://api.staging.betayum.com',
        'https://portal.staging.betayum.com',
      ]),
    );
  });

  it('allows configured roots and subdomains while rejecting lookalikes', () => {
    const trustedOrigins = getConfiguredTrustedOrigins({
      primaryDomain: 'betayum.com',
      stagingDomain: 'staging.betayum.com',
    });
    const trustedRootDomains = ['betayum.com', 'staging.betayum.com'];

    expect(
      isTrustedStaticOrigin({
        origin: 'https://app.betayum.com',
        trustedOrigins,
        trustedRootDomains,
      }),
    ).toBe(true);
    expect(
      isTrustedStaticOrigin({
        origin: 'https://app.staging.betayum.com',
        trustedOrigins,
        trustedRootDomains,
      }),
    ).toBe(true);
    expect(
      isTrustedStaticOrigin({
        origin: 'https://betayum.com.evil.com',
        trustedOrigins,
        trustedRootDomains,
      }),
    ).toBe(false);
  });
});
