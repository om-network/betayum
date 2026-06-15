import { brandConfig } from '@trycompai/utils/brand';

const DEFAULT_LOCAL_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3002',
  'http://localhost:3333',
  'http://localhost:3004',
  'http://localhost:3008',
];

const DEFAULT_PRIMARY_DOMAIN = brandConfig.domains.primary;
const DEFAULT_STAGING_DOMAIN = brandConfig.domains.staging;
const DEFAULT_EXTRA_ORIGINS = [
  `https://dev.${brandConfig.domains.primary}`,
  `https://framework-editor.${brandConfig.domains.primary}`,
];
const DEFAULT_EXTRA_TRUSTED_ROOT_DOMAINS = ['trust.inc'];
const SERVICE_SUBDOMAINS = ['app', 'api', 'portal'];

interface CookieDomainOptions {
  baseUrl: string;
  explicitCookieDomain?: string;
  primaryDomain?: string;
  stagingDomain?: string;
}

interface TrustedOriginsOptions {
  explicitTrustedOrigins?: string;
  primaryDomain?: string;
  stagingDomain?: string;
}

interface TrustedRootDomainsOptions {
  explicitTrustedRootDomains?: string;
  primaryDomain?: string;
  stagingDomain?: string;
}

interface TrustedStaticOriginOptions {
  origin: string;
  trustedOrigins: string[];
  trustedRootDomains: string[];
}

interface StagingCookiePrefixOptions {
  cookieDomain: string | undefined;
  stagingDomain?: string;
}

interface TrustedCustomDomainWhere {
  domain: { not: null };
  domainVerified: true;
  status: 'published';
}

function parseCommaSeparated(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^\./, '').replace(/\.$/, '');
}

function withLeadingDot(domain: string): string {
  return `.${normalizeDomain(domain)}`;
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  );
}

function hostnameMatchesDomain(hostname: string, domain: string): boolean {
  const normalizedHostname = normalizeDomain(hostname);
  const normalizedDomain = normalizeDomain(domain);

  return (
    normalizedHostname === normalizedDomain ||
    normalizedHostname.endsWith(`.${normalizedDomain}`)
  );
}

function deriveServiceCookieDomain(hostname: string): string | undefined {
  const labels = normalizeDomain(hostname).split('.');
  const [service, ...rootLabels] = labels;

  if (!service || !SERVICE_SUBDOMAINS.includes(service)) {
    return undefined;
  }

  if (rootLabels.length < 2) {
    return undefined;
  }

  return `.${rootLabels.join('.')}`;
}

export function deriveCookieDomain({
  baseUrl,
  explicitCookieDomain,
  primaryDomain,
  stagingDomain,
}: CookieDomainOptions): string | undefined {
  if (explicitCookieDomain) {
    return withLeadingDot(explicitCookieDomain);
  }

  let hostname: string;
  try {
    hostname = new URL(baseUrl).hostname;
  } catch {
    return undefined;
  }

  if (isLocalHostname(hostname)) {
    return undefined;
  }

  if (stagingDomain && hostnameMatchesDomain(hostname, stagingDomain)) {
    return withLeadingDot(stagingDomain);
  }

  if (primaryDomain && hostnameMatchesDomain(hostname, primaryDomain)) {
    return withLeadingDot(primaryDomain);
  }

  return deriveServiceCookieDomain(hostname);
}

export function getConfiguredTrustedOrigins({
  explicitTrustedOrigins,
  primaryDomain = DEFAULT_PRIMARY_DOMAIN,
  stagingDomain = DEFAULT_STAGING_DOMAIN,
}: TrustedOriginsOptions): string[] {
  const parsedOrigins = parseCommaSeparated(explicitTrustedOrigins);
  if (parsedOrigins.length > 0) {
    return parsedOrigins;
  }

  const serviceOrigins = SERVICE_SUBDOMAINS.flatMap((service) => [
    `https://${service}.${normalizeDomain(primaryDomain)}`,
    `https://${service}.${normalizeDomain(stagingDomain)}`,
  ]);

  return [
    ...DEFAULT_LOCAL_ORIGINS,
    ...serviceOrigins,
    ...DEFAULT_EXTRA_ORIGINS,
  ];
}

export function getConfiguredTrustedRootDomains({
  explicitTrustedRootDomains,
  primaryDomain = DEFAULT_PRIMARY_DOMAIN,
  stagingDomain = DEFAULT_STAGING_DOMAIN,
}: TrustedRootDomainsOptions): string[] {
  const parsedDomains = parseCommaSeparated(explicitTrustedRootDomains);
  if (parsedDomains.length > 0) {
    return parsedDomains.map(normalizeDomain);
  }

  return [
    normalizeDomain(primaryDomain),
    normalizeDomain(stagingDomain),
    ...DEFAULT_EXTRA_TRUSTED_ROOT_DOMAINS,
  ];
}

export function isTrustedStaticOrigin({
  origin,
  trustedOrigins,
  trustedRootDomains,
}: TrustedStaticOriginOptions): boolean {
  if (trustedOrigins.includes(origin)) {
    return true;
  }

  try {
    const { hostname } = new URL(origin);
    return trustedRootDomains.some((domain) =>
      hostnameMatchesDomain(hostname, domain),
    );
  } catch {
    return false;
  }
}

export function shouldUseStagingCookiePrefix({
  cookieDomain,
  stagingDomain = DEFAULT_STAGING_DOMAIN,
}: StagingCookiePrefixOptions): boolean {
  if (!cookieDomain) {
    return false;
  }

  return normalizeDomain(cookieDomain) === normalizeDomain(stagingDomain);
}

export function getTrustedCustomDomainWhere(): TrustedCustomDomainWhere {
  return {
    domain: { not: null },
    domainVerified: true,
    status: 'published',
  };
}
