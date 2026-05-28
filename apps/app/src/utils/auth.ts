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

// Must point to the API server for server-to-server auth calls.
const API_URL =
  process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';

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
 * Convert Headers to a plain object for fetch
 */
function headersToObject(headers: ReadonlyHeaders | Headers): Record<string, string> {
  const obj: Record<string, string> = {};
  headers.forEach((value, key) => {
    const k = key.toLowerCase();
    // Forward cookies, origin, and custom headers to the API auth endpoints.
    if (k === 'cookie' || k === 'origin' || k.startsWith('x-')) {
      obj[key] = value;
    }
  });
  // Ensure Origin is always present — server actions may not have one.
  // The API enforces trusted origins on auth mutations.
  if (!obj.origin && !obj.Origin) {
    obj.origin = API_URL;
  }
  return obj;
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
    const response = await fetch(`${API_URL}/api/auth/get-full-session`, {
      method: 'GET',
      headers: {
        ...headersToObject(options.headers),
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data as FullSession;
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
 * Check if the current user has a specific permission.
 *
 * @param options.headers - The request headers (must include cookies)
 * @param options.body.permission - The permission to check
 * @returns Object with success boolean
 */
async function hasPermission(options: {
  headers: ReadonlyHeaders | Headers;
  body: {
    permission: Record<string, string[]>;
  };
}): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_URL}/api/auth/organization/has-permission`, {
      method: 'POST',
      headers: {
        ...headersToObject(options.headers),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(options.body),
      cache: 'no-store',
    });

    if (!response.ok) {
      return { success: false, error: 'Request failed' };
    }

    const data = await response.json();
    return { success: data.success === true };
  } catch (error) {
    if (IS_DEVELOPMENT) {
      console.error('[auth] Failed to check permission:', error);
    }
    return { success: false, error: 'Request failed' };
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
 * Add a member to an organization.
 *
 * @param options.headers - The request headers (must include cookies)
 * @param options.body - The member data
 * @returns The created member or null
 */
async function addMember(options: {
  headers: ReadonlyHeaders | Headers;
  body: {
    userId: string;
    role: string;
    organizationId: string;
  };
}): Promise<Member | null> {
  try {
    const response = await fetch(`${API_URL}/api/auth/organization/add-member`, {
      method: 'POST',
      headers: {
        ...headersToObject(options.headers),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(options.body),
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to add member');
    }

    const data = await response.json();
    return data as Member;
  } catch (error) {
    if (IS_DEVELOPMENT) {
      console.error('[auth] Failed to add member:', error);
    }
    throw error;
  }
}

/**
 * Sign up with email and password.
 * Note: This is mainly for testing. In production, use the auth client.
 */
function signUpEmail(options: {
  body: { email: string; password: string; name: string };
  headers?: ReadonlyHeaders | Headers;
  asResponse: true;
}): Promise<Response>;
function signUpEmail(options: {
  body: { email: string; password: string; name: string };
  headers?: ReadonlyHeaders | Headers;
  asResponse?: false;
}): Promise<Session | null>;
async function signUpEmail(options: {
  body: { email: string; password: string; name: string };
  headers?: ReadonlyHeaders | Headers;
  asResponse?: boolean;
}): Promise<Response | Session | null> {
  try {
    const response = await fetch(`${API_URL}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ? headersToObject(options.headers) : {}),
      },
      body: JSON.stringify(options.body),
    });

    if (options.asResponse) {
      return response;
    }

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data as Session;
  } catch (error) {
    if (IS_DEVELOPMENT) {
      console.error('[auth] Failed to sign up:', error);
    }
    if (options.asResponse) {
      return new Response(JSON.stringify({ error: 'Failed to sign up' }), { status: 500 });
    }
    return null;
  }
}

/**
 * Sign in with email and password.
 * Note: This is mainly for testing. In production, use the auth client.
 */
function signInEmail(options: {
  body: { email: string; password: string };
  headers?: ReadonlyHeaders | Headers;
  asResponse: true;
}): Promise<Response>;
function signInEmail(options: {
  body: { email: string; password: string };
  headers?: ReadonlyHeaders | Headers;
  asResponse?: false;
}): Promise<Session | null>;
async function signInEmail(options: {
  body: { email: string; password: string };
  headers?: ReadonlyHeaders | Headers;
  asResponse?: boolean;
}): Promise<Response | Session | null> {
  try {
    const response = await fetch(`${API_URL}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ? headersToObject(options.headers) : {}),
      },
      body: JSON.stringify(options.body),
    });

    if (options.asResponse) {
      return response;
    }

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data as Session;
  } catch (error) {
    if (IS_DEVELOPMENT) {
      console.error('[auth] Failed to sign in:', error);
    }
    if (options.asResponse) {
      return new Response(JSON.stringify({ error: 'Failed to sign in' }), { status: 500 });
    }
    return null;
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
    hasPermission,
    listOrganizations,
    setActiveOrganization,
    getFullOrganization,
    createInvitation,
    addMember,
    signUpEmail,
    signInEmail,
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
