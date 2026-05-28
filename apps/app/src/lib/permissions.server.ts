import 'server-only';

import { serverApi } from '@/lib/api-server';
import { auth as clerkAuth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import {
  type UserPermissions,
  canAccessAuditorViewFromClerk,
  canAccessRoute,
  getDefaultRoute,
  hasPermission,
  resolveClerkOrganizationPermissions,
} from './permissions';

interface AuthMeResponse {
  user: {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
    role: string | null;
  } | null;
  organizations: Array<{
    id: string;
    clerkOrganizationId: string | null;
    memberRole: string | null;
  }>;
}

/**
 * Resolve permissions for the current user in the given org.
 * Self-contained: validates the active Clerk organization against the local
 * route organization and resolves Clerk organization permission claims.
 */
export async function resolveCurrentUserPermissions(
  orgId: string,
): Promise<UserPermissions | null> {
  const authContext = await clerkAuth();
  if (!authContext.userId || !authContext.orgId) return null;

  const meResponse = await serverApi.get<AuthMeResponse>('/v1/auth/me');
  const organization = meResponse.data?.organizations.find((org) => org.id === orgId);
  if (organization?.clerkOrganizationId !== authContext.orgId) return null;

  return resolveClerkOrganizationPermissions(authContext.orgPermissions);
}

/**
 * Route guard for server page components.
 * Resolves permissions for the current user and redirects if they
 * don't have access to the given route segment.
 */
export async function requireRoutePermission(routeSegment: string, orgId: string): Promise<void> {
  const permissions = await resolveCurrentUserPermissions(orgId);

  if (!permissions || !canAccessRoute(permissions, routeSegment)) {
    const defaultRoute = permissions ? getDefaultRoute(permissions, orgId) : null;
    redirect(defaultRoute ?? '/no-access');
  }
}

/**
 * Server-side Auditor View access check. Mirrors the client-side
 * `canAccessAuditorViewFromClerk` after API-backed org membership validation.
 * Returns null if the user isn't in the org.
 */
export async function resolveAuditorViewAccess(
  orgId: string,
): Promise<{ canAccess: boolean; roleString: string | null } | null> {
  const authContext = await clerkAuth();
  if (!authContext.userId) return null;

  const permissions = await resolveCurrentUserPermissions(orgId);
  if (!permissions) return null;
  return {
    canAccess: canAccessAuditorViewFromClerk({
      organizationRole: authContext.orgRole,
      permissions,
    }),
    roleString: authContext.orgRole ?? null,
  };
}

/**
 * Route guard for the Auditor View page. Replaces `requireRoutePermission(
 * 'auditor', orgId)` — the plain permission check let owner/admin through
 * via their implicit `audit:read`. This helper enforces the stricter
 * "built-in Clerk auditor OR non-admin Clerk role with audit:read" rule.
 */
export async function requireAuditorViewAccess(orgId: string): Promise<void> {
  const result = await resolveAuditorViewAccess(orgId);
  if (result?.canAccess) return;

  const permissions = await resolveCurrentUserPermissions(orgId);
  const defaultRoute = permissions ? getDefaultRoute(permissions, orgId) : null;
  redirect(defaultRoute ?? '/no-access');
}

export interface ApiPermissionContext {
  organizationId: string;
  userId: string;
  permissions: UserPermissions;
}

/**
 * Permission guard for Next.js Route Handlers (`app/api/.../route.ts`). On
 * success, returns a context object with the active org id, user id, and
 * resolved permissions. On failure, returns a `NextResponse` to forward to
 * the client. Caller pattern:
 *
 *     const ctx = await requireApiPermission(req, 'risk', 'update');
 *     if (ctx instanceof NextResponse) return ctx;
 *     // ...use ctx.organizationId, ctx.permissions...
 *
 * The Next.js mutation routes for risk/vendor auto-link, relink, and unlink
 * orchestrate work that the NestJS API doesn't host directly (trigger.dev
 * tokens, Upstash queries, Prisma joins). These endpoints still need the
 * same RBAC contract as the API — see Cubic finding #9 on PR #2671.
 */
export async function requireApiPermission(
  _req: Request,
  resource: string,
  action: string,
): Promise<ApiPermissionContext | NextResponse> {
  const authContext = await clerkAuth();
  if (!authContext.userId || !authContext.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const meResponse = await serverApi.get<AuthMeResponse>('/v1/auth/me');
  const user = meResponse.data?.user;
  const organization = meResponse.data?.organizations.find(
    (org) => org.clerkOrganizationId === authContext.orgId,
  );
  if (!organization || !user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const permissions = resolveClerkOrganizationPermissions(authContext.orgPermissions);
  if (!hasPermission(permissions, resource, action)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return { organizationId: organization.id, userId: user.id, permissions };
}
