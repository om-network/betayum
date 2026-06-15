const STAGING_API_HOST = 'api.staging.betayum.com';
const PRODUCTION_API_HOST = 'api.betayum.com';
const LOCAL_API_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function getBaseUrlHostname(baseUrl: string): string | null {
  try {
    return new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function describeServer(baseUrl: string): string {
  const hostname = getBaseUrlHostname(baseUrl);

  if (hostname === STAGING_API_HOST) return 'Staging API Server';
  if (hostname === PRODUCTION_API_HOST) return 'Production API Server';
  if (hostname && LOCAL_API_HOSTS.has(hostname)) return 'Local API Server';

  return 'API Server';
}
