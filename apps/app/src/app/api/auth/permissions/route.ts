import { resolveCurrentUserOrganizationContext } from '@/lib/permissions.server';
import { auth as clerkAuth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const organizationId =
    req.headers.get('x-organization-id')?.trim() ||
    getOrganizationIdFromPath(req.headers.get('referer'));

  if (!organizationId) {
    return NextResponse.json(
      { error: 'Organization context required (missing X-Organization-Id).' },
      { status: 400 },
    );
  }

  const context = await resolveCurrentUserOrganizationContext(organizationId);
  if (!context) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const authContext = await clerkAuth();

  return NextResponse.json({
    permissions: context.permissions,
    organizationRole: authContext.orgRole ?? null,
  });
}

function getOrganizationIdFromPath(value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    const [, organizationId] = new URL(value).pathname.match(/^\/([^/]+)/) ?? [];
    return organizationId ?? null;
  } catch {
    const [, organizationId] = value.match(/^\/([^/]+)/) ?? [];
    return organizationId ?? null;
  }
}
