const AUTOMATION_API_PREFIX = '/api/tasks-automations/';

function isAbsoluteEndpoint(endpoint: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(endpoint) || endpoint.startsWith('//');
}

function normalizeHostname(hostname: string): string {
  const normalizedHost = hostname.toLowerCase();
  return normalizedHost.startsWith('[') && normalizedHost.endsWith(']')
    ? normalizedHost.slice(1, -1)
    : normalizedHost;
}

function isLocalhost(hostname: string): boolean {
  const normalizedHost = normalizeHostname(hostname);
  return (
    normalizedHost === 'localhost' || normalizedHost === '127.0.0.1' || normalizedHost === '::1'
  );
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }

  const [first, second] = parts;
  if (first === undefined || second === undefined) {
    return false;
  }

  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254) ||
    first === 0
  );
}

function isPrivateHost(hostname: string): boolean {
  const normalizedHost = normalizeHostname(hostname);
  return (
    isLocalhost(normalizedHost) || isPrivateIpv4(normalizedHost) || isPrivateIpv6(normalizedHost)
  );
}

function isPrivateIpv6(hostname: string): boolean {
  const normalizedHost = normalizeHostname(hostname);
  return (
    normalizedHost === '::' ||
    normalizedHost === '::1' ||
    normalizedHost.startsWith('fc') ||
    normalizedHost.startsWith('fd') ||
    normalizedHost.startsWith('fe80:') ||
    normalizedHost.startsWith('::ffff:')
  );
}

export function createEnterpriseApiUrl({
  baseUrl,
  endpoint,
  params,
  nodeEnv = process.env.NODE_ENV ?? 'development',
}: {
  baseUrl: string;
  endpoint: string;
  params?: Record<string, string>;
  nodeEnv?: string;
}): URL {
  if (isAbsoluteEndpoint(endpoint) || !endpoint.startsWith(AUTOMATION_API_PREFIX)) {
    throw new Error('Enterprise API endpoint must be a relative automation path');
  }

  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' && base.protocol !== 'http:') {
    throw new Error('Enterprise API base URL must use HTTP or HTTPS');
  }

  const privateHost = isPrivateHost(base.hostname);
  const localhostDev = isLocalhost(base.hostname) && nodeEnv !== 'production';
  if ((privateHost && !localhostDev) || (nodeEnv === 'production' && base.protocol !== 'https:')) {
    throw new Error('Enterprise API base URL must not target a private network');
  }

  const url = new URL(endpoint, base);
  if (url.origin !== base.origin) {
    throw new Error('Enterprise API endpoint must stay on the configured origin');
  }

  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.append(key, value);
  }

  return url;
}
