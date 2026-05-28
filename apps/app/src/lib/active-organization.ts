import { cookies } from 'next/headers';

export const ACTIVE_ORGANIZATION_COOKIE = 'active_organization_id';

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

function getCookieDomain(): string | undefined {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';

  if (appUrl.includes('staging.trycomp.ai')) {
    return '.staging.trycomp.ai';
  }

  if (appUrl.includes('trycomp.ai')) {
    return '.trycomp.ai';
  }

  return undefined;
}

export async function getActiveOrganizationCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value ?? null;
}

export async function setActiveOrganizationCookie(
  organizationId: string,
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORGANIZATION_COOKIE, organizationId, {
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    domain: getCookieDomain(),
    maxAge: ONE_YEAR_IN_SECONDS,
  });
}
