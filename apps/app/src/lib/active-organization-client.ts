'use client';

import { ACTIVE_ORGANIZATION_COOKIE } from './active-organization';

function getCookieDomain(hostname: string): string | null {
  if (hostname.endsWith('.staging.trycomp.ai')) {
    return '.staging.trycomp.ai';
  }

  if (hostname.endsWith('.trycomp.ai')) {
    return '.trycomp.ai';
  }

  return null;
}

function writeCookie({
  name,
  value,
  maxAge,
  domain,
}: {
  name: string;
  value: string;
  maxAge?: number;
  domain?: string;
}): void {
  const parts = [`${name}=${value}`, 'path=/', 'samesite=lax'];

  if (typeof maxAge === 'number') {
    parts.push(`max-age=${maxAge}`);
  }

  if (domain) {
    parts.push(`domain=${domain}`);
  }

  if (window.location.protocol === 'https:') {
    parts.push('secure');
  }

  document.cookie = parts.join('; ');
}

export function setActiveOrganizationCookieClient(organizationId: string): void {
  if (typeof document === 'undefined') {
    return;
  }

  const domain = getCookieDomain(window.location.hostname);
  writeCookie({
    name: ACTIVE_ORGANIZATION_COOKIE,
    value: encodeURIComponent(organizationId),
    maxAge: 60 * 60 * 24 * 365,
    domain: domain ?? undefined,
  });
}

export function clearActiveOrganizationCookieClient(): void {
  if (typeof document === 'undefined') {
    return;
  }

  const hostname = window.location.hostname;
  const domains = [undefined, hostname, getCookieDomain(hostname)];

  for (const domain of domains) {
    writeCookie({
      name: ACTIVE_ORGANIZATION_COOKIE,
      value: '',
      maxAge: 0,
      domain: domain ?? undefined,
    });
  }
}
