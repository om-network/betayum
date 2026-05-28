/**
 * Server-side auth utilities for the App.
 *
 * This module provides server-side session validation by calling the API's
 * auth endpoints. The actual auth server runs on the API - this app only
 * consumes auth services.
 *
 * For browser-side auth (login, logout, hooks), use auth-client.ts instead.
 */

import { serverApi } from '@/lib/api-server';
import {
  getActiveOrganizationCookie,
  setActiveOrganizationCookie,
} from '@/lib/active-organization';
import type { ReadonlyHeaders } from 'next/dist/server/web/spec-extension/adapters/headers';
import { ac, allRoles } from './permissions';

// Re-export permissions for convenience
export { ac, allRoles };

const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';

/**
 * Session type matching the API session payload shape.
 */
export interface Session {
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
    token: string;
    createdAt: Date;
    updatedAt: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
    activeOrganizationId?: string | null;
  };
  user: {
    id: string;
    email: string;
    emailVerified: boolean;
    name: string;
    image?: string | null;
    createdAt: Date;
    updatedAt: Date;
    role?: string | null;
  };
}

/**
 * Active organization type
 */
export interface ActiveOrganization {
  id: string;
  name: string;
  slug?: string | null;
  logo?: string | null;
  createdAt: Date;
  metadata?: Record<string, unknown> | null;
}

/**
 * Member type with role information
 */
export interface Member {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  createdAt: Date;
}

/**
 * Organization type
 */
export interface Organization {
  id: string;
  name: string;
  slug?: string | null;
  logo?: string | null;
  createdAt: Date;
  metadata?: Record<string, unknown> | null;
}

/**
 * Invitation type
 */
export interface Invitation {
  id: string;
  organizationId: string;
  email: string;
  role: string;
  status: string;
  expiresAt: Date;
  inviterId: string;
}

/**
 * Role type - matches the roles defined in permissions
 */
export type Role = keyof typeof allRoles;

/**
 * Full session response including organization context
 */
export interface FullSession extends Session {
  activeOrganization?: ActiveOrganization | null;
  activeMember?: Member | null;
}

interface MeResponse {
  user: Session['user'] | null;
  organizations: Array<
    Organization & {
      memberRole: string;
      memberId: string;
    }
  >;
  pendingInvitation: { id: string } | null;
}

/**
 * Get the current session from the API.
 *
 * @param options.headers - The request headers (must include cookies)
 * @returns The session data or null if not authenticated
 */
async function getSession(options: { headers: ReadonlyHeaders | Headers }): Promise<Session | null> {
  try {
    const response = await serverApi.get<MeResponse>('/v1/auth/me');
    const data = response.data;
    if (!data?.user) {
      return null;
    }

    const activeOrganizationId =
      (await getActiveOrganizationCookie()) ?? data.organizations[0]?.id ?? null;

    return {
      session: {
        id: 'clerk-session',
        userId: data.user.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        token: '',
        createdAt: new Date(),
        updatedAt: new Date(),
        activeOrganizationId,
      },
      user: data.user,
    };
  } catch (error) {
    if (IS_DEVELOPMENT) {
      console.error('[auth] Failed to get session:', error);
    }
    return null;
  }
}

/**
 * Get the full session including active organization and member.
 *
 * @param options.headers - The request headers (must include cookies)
 * @returns The full session data or null if not authenticated
 */
async function getFullSession(options: {
  headers: ReadonlyHeaders | Headers;
}): Promise<FullSession | null> {
  try {
    const session = await getSession(options);
    if (!session) {
      return null;
    }

    const activeOrganization = await getActiveOrganization(options);
    const activeMember = await getActiveMember(options);

    return {
      ...session,
      activeOrganization,
      activeMember,
    };
  } catch (error) {
    if (IS_DEVELOPMENT) {
      console.error('[auth] Failed to get full session:', error);
    }
    return null;
  }
}

/**
 * Get the active member for the current session.
 *
 * @param options.headers - The request headers (must include cookies)
 * @returns The active member or null
 */
async function getActiveMember(options: {
  headers: ReadonlyHeaders | Headers;
}): Promise<Member | null> {
  try {
    const response = await serverApi.get<MeResponse>('/v1/auth/me');
    const data = response.data;
    if (!data?.user) {
      return null;
    }

    const activeOrganizationId =
      (await getActiveOrganizationCookie()) ?? data.organizations[0]?.id ?? null;
    const organization = data.organizations.find((item) => item.id === activeOrganizationId);

    if (!organization) {
      return null;
    }

    return {
      id: organization.memberId,
      organizationId: organization.id,
      userId: data.user.id,
      role: organization.memberRole,
      createdAt: new Date(organization.createdAt),
    };
  } catch (error) {
    if (IS_DEVELOPMENT) {
      console.error('[auth] Failed to get active member:', error);
    }
    return null;
  }
}

/**
 * List organizations for the current user.
 *
 * @param options.headers - The request headers (must include cookies)
 * @returns Array of organizations or empty array
 */
async function listOrganizations(options: {
  headers: ReadonlyHeaders | Headers;
}): Promise<Organization[]> {
  try {
    const response = await serverApi.get<MeResponse>('/v1/auth/me');
    return response.data?.organizations ?? [];
  } catch (error) {
    if (IS_DEVELOPMENT) {
      console.error('[auth] Failed to list organizations:', error);
    }
    return [];
  }
}

/**
 * Set the active organization for the current session.
 */
function setActiveOrganization(options: {
  headers: ReadonlyHeaders | Headers;
  body: { organizationId: string };
  asResponse: true;
}): Promise<Response>;
function setActiveOrganization(options: {
  headers: ReadonlyHeaders | Headers;
  body: { organizationId: string };
  asResponse?: false;
}): Promise<Session | null>;
async function setActiveOrganization(options: {
  headers: ReadonlyHeaders | Headers;
  body: { organizationId: string };
  asResponse?: boolean;
}): Promise<Response | Session | null> {
  try {
    await setActiveOrganizationCookie(options.body.organizationId);

    if (options.asResponse) {
      return new Response(null, { status: 204 });
    }

    return getSession({ headers: options.headers });
  } catch (error) {
    if (IS_DEVELOPMENT) {
      console.error('[auth] Failed to set active organization:', error);
    }
    if (options.asResponse) {
      return new Response(JSON.stringify({ error: 'Failed to set active organization' }), { status: 500 });
    }
    return null;
  }
}

/**
 * Full organization response including members
 */
export interface FullOrganization extends Organization {
  members: Member[];
  invitations?: Invitation[];
}

async function getActiveOrganization(options: {
  headers: ReadonlyHeaders | Headers;
}): Promise<ActiveOrganization | null> {
  const organizations = await listOrganizations(options);
  const activeOrganizationId =
    (await getActiveOrganizationCookie()) ?? organizations[0]?.id ?? null;

  if (!activeOrganizationId) {
    return null;
  }

  return (
    organizations.find((organization) => organization.id === activeOrganizationId) ??
    null
  );
}

/**
 * Get the full organization including members.
 *
 * @param options.headers - The request headers (must include cookies)
 * @returns The full organization or null
 */
async function getFullOrganization(options: {
  headers: ReadonlyHeaders | Headers;
}): Promise<FullOrganization | null> {
  try {
    const response = await serverApi.get<MeResponse>('/v1/auth/me');
    const data = response.data;
    if (!data?.user) {
      return null;
    }

    const activeOrganizationId =
      (await getActiveOrganizationCookie()) ?? data.organizations[0]?.id ?? null;
    const organization = data.organizations.find((item) => item.id === activeOrganizationId);

    if (!organization) {
      return null;
    }

    return {
      ...organization,
      members: [
        {
          id: organization.memberId,
          organizationId: organization.id,
          userId: data.user.id,
          role: organization.memberRole,
          createdAt: new Date(organization.createdAt),
        },
      ],
      invitations: [],
    };
  } catch (error) {
    if (IS_DEVELOPMENT) {
      console.error('[auth] Failed to get full organization:', error);
    }
    return null;
  }
}

/**
 * Create an invitation to an organization.
 *
 * @param options.headers - The request headers (must include cookies)
 * @param options.body - The invitation data
 * @returns The created invitation or null
 */
async function createInvitation(options: {
  headers: ReadonlyHeaders | Headers;
  body: {
    email: string;
    role: string;
    organizationId: string;
  };
}): Promise<Invitation | null> {
  try {
    const response = await serverApi.post(
      '/v1/people/invite',
      {
        invites: [
          {
            email: options.body.email,
            roles: options.body.role.split(','),
          },
        ],
      },
      options.body.organizationId,
    );

    if (response.error) {
      throw new Error(response.error);
    }

    return {
      id: `invited:${options.body.email}`,
      organizationId: options.body.organizationId,
      email: options.body.email,
      role: options.body.role,
      status: 'pending',
      expiresAt: new Date(),
      inviterId: '',
    };
  } catch (error) {
    if (IS_DEVELOPMENT) {
      console.error('[auth] Failed to create invitation:', error);
    }
    throw error;
  }
}

/**
 * Server-side auth API object that preserves the legacy app auth interface.
 *
 * Usage:
 * ```ts
 * import { auth } from '@/utils/auth';
 *
 * const session = await auth.api.getSession({ headers: await headers() });
 * ```
 */
export const auth = {
  api: {
    getSession,
    getFullSession,
    getActiveMember,
    listOrganizations,
    setActiveOrganization,
    getFullOrganization,
    createInvitation,
  },
  /**
   * Type inference helpers for compatibility with existing code.
   * These mirror the legacy auth helper surface used throughout the app.
   */
  $Infer: {
    Session: {} as Session,
    ActiveOrganization: {} as ActiveOrganization,
    Member: {} as Member,
    Organization: {} as Organization,
    Invitation: {} as Invitation,
  },
};

// Re-export types for convenience (maintains compatibility with existing imports)
export type { ReadonlyHeaders };
