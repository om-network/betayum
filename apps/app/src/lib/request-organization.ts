import 'server-only';

import { headers } from 'next/headers';

export async function getRequestOrganizationId(): Promise<string | null> {
  const headerStore = await headers();
  const pathname =
    headerStore.get('x-pathname') ?? parsePathname(headerStore.get('referer'));
  const [, organizationId] = pathname?.match(/^\/([^/]+)/) ?? [];
  return organizationId ?? null;
}

function parsePathname(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).pathname;
  } catch {
    return value.startsWith('/') ? value : null;
  }
}
