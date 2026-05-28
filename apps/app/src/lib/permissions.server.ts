import 'server-only';

import { auth as clerkAuth } from '@clerk/nextjs/server';
import { db } from '@db/server';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import {
  type UserPermissions,
  canAccessAuditorView,
  canAccessRoute,
  getDefaultRoute,
  hasPermission,
  mergePermissions,
  resolveBuiltInPermissions,
  resolveClerkOrganizationPermissions,
} from './permissions';

/**
 * Resolve effective permissions for a member's comma-separated role string.
 * Handles both built-in roles (from @trycompai/auth) and custom roles (from DB).
 */
export async function resolveUserPermissions(
  roleString: string | null | undefined,
  organizationId: string,
): Promise<UserPermissions> {
  const { permissions, customRoleNames } = resolveBuiltInPermissions(roleString);

  if (customRoleNames.length > 0) {
    const customRoles = await db.organizationRole.findMany({
      where: {
        organizationId,
        name: { in: customRoleNames },
      },
      select: { permissions: true },
    });

    for (const role of customRoles) {
      if (!role.permissions) continue;
      const parsed = parsePermissionMap(role.permissions);
      if (parsed) {
        mergePermissions(permissions, parsed);
      }
    }
  }

  return permissions;
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

  const organization = await db.organization.findUnique({
    where: { id: orgId },
    select: { clerkOrganizationId: true },
  });
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
 * CS-189: Resolve only the permissions granted by the user's CUSTOM org
 * roles (i.e. not from built-in roles). Needed for the Auditor View
 * visibility rule, which wants to know whether a custom role explicitly
 * grants `audit:read` — owner/admin's implicit all-permissions don't count.
 */
export async function resolveCustomRolePermissions(
  roleString: string | null | undefined,
  orgId: string,
): Promise<UserPermissions> {
  const { customRoleNames } = resolveBuiltInPermissions(roleString);
  const result: UserPermissions = {};
  if (customRoleNames.length === 0) return result;

  const customRoles = await db.organizationRole.findMany({
    where: { organizationId: orgId, name: { in: customRoleNames } },
    select: { permissions: true },
  });

  for (const role of customRoles) {
    if (!role.permissions) continue;
    const parsed = parsePermissionMap(role.permissions);
    if (parsed) {
      mergePermissions(result, parsed);
    }
  }
  return result;
}

/**
 * Server-side Auditor View access check. Mirrors the client-side
 * `canAccessAuditorView` but pulls the custom-role permissions from the
 * DB for the current user. Returns null if the user isn't in the org.
 */
export async function resolveAuditorViewAccess(
  orgId: string,
): Promise<{ canAccess: boolean; roleString: string | null } | null> {
  const authContext = await clerkAuth();
  if (!authContext.userId || !authContext.orgId) return null;

  const member = await db.member.findFirst({
    where: {
      user: { clerkUserId: authContext.userId },
      organizationId: orgId,
      organization: { clerkOrganizationId: authContext.orgId },
      deactivated: false,
    },
    select: { role: true },
  });
  if (!member) return null;

  const customPerms = await resolveCustomRolePermissions(member.role, orgId);
  return {
    canAccess: canAccessAuditorView(member.role, customPerms),
    roleString: member.role,
  };
}

/**
 * Route guard for the Auditor View page. Replaces `requireRoutePermission(
 * 'auditor', orgId)` — the plain permission check let owner/admin through
 * via their implicit `audit:read`. This helper enforces the stricter
 * "built-in auditor OR custom role with audit:read" rule.
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

  const [organization, user] = await Promise.all([
    db.organization.findUnique({
      where: { clerkOrganizationId: authContext.orgId },
      select: { id: true },
    }),
    db.user.findUnique({
      where: { clerkUserId: authContext.userId },
      select: { id: true },
    }),
  ]);
  if (!organization || !user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const permissions = resolveClerkOrganizationPermissions(authContext.orgPermissions);
  if (!hasPermission(permissions, resource, action)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return { organizationId: organization.id, userId: user.id, permissions };
}

function parsePermissionMap(value: unknown): Record<string, string[]> | null {
  const parsed = typeof value === 'string' ? safeParseJson(value) : value;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  const permissions: Record<string, string[]> = {};
  for (const [resource, actions] of Object.entries(parsed)) {
    if (!Array.isArray(actions) || actions.some((action) => typeof action !== 'string')) {
      return null;
    }

    permissions[resource] = actions;
  }

  return permissions;
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
