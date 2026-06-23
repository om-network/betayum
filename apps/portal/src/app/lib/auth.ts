/**
 * Server-side auth utilities for the Portal.
 *
 * This module provides server-side session validation by calling the NestJS API's
 * auth endpoints. The actual auth server runs on the API — this app only
 * consumes auth services.
 *
 * For browser-side auth (login, logout, hooks), use auth-client.ts instead.
 */

import type { ReadonlyHeaders } from 'next/dist/server/web/spec-extension/adapters/headers';

const API_URL =
  process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';

const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';

/**
 * Session type matching better-auth's session structure
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
  };
}

export interface ActiveOrganization {
  id: string;
  name: string;
  slug?: string | null;
  logo?: string | null;
  createdAt: Date;
  metadata?: Record<string, unknown> | null;
}

export interface Member {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  createdAt: Date;
}

export interface Organization {
  id: string;
  name: string;
  slug?: string | null;
  logo?: string | null;
  createdAt: Date;
  metadata?: Record<string, unknown> | null;
}

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
 * Convert Headers to a plain object for fetch
 */
function headersToObject(headers: ReadonlyHeaders | Headers): Record<string, string> {
  const obj: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (key.toLowerCase() === 'cookie' || key.toLowerCase().startsWith('x-')) {
      obj[key] = value;
    }
  });
  return obj;
}

function getRequestOrigin(headers: ReadonlyHeaders | Headers): string {
  const forwardedOrigin = headers.get('origin');
  if (forwardedOrigin) {
    return forwardedOrigin;
  }

  const referer = headers.get('referer');
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      // Fall through to forwarded host detection.
    }
  }

  const forwardedProto = headers.get('x-forwarded-proto');
  const forwardedHost = headers.get('x-forwarded-host') ?? headers.get('host');
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  for (const value of [
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
    process.env.BETTER_AUTH_URL,
    process.env.NEXT_PUBLIC_PORTAL_URL,
  ]) {
    if (!value) {
      continue;
    }

    try {
      return new URL(value).origin;
    } catch {
      continue;
    }
  }

  return API_URL;
}

function summarizeCookieHeader(cookieHeader: string | undefined) {
  if (!cookieHeader) {
    return {
      present: false,
      cookieNames: [],
      hasBetterAuthCookie: false,
    };
  }

  const cookieNames = cookieHeader
    .split(';')
    .map((part) => part.trim().split('=')[0])
    .filter(Boolean);

  return {
    present: true,
    cookieNames,
    hasBetterAuthCookie: cookieNames.some(
      (name) => name.includes('better-auth') || name.includes('local'),
    ),
  };
}

/**
 * Get the current session from the API.
 */
async function getSession(options: { headers: ReadonlyHeaders | Headers }): Promise<Session | null> {
  try {
    const forwardedHeaders = headersToObject(options.headers);
    if (IS_DEVELOPMENT) {
      console.log(
        '[portal auth] getSession request',
        JSON.stringify({
          apiUrl: API_URL,
          cookieSummary: summarizeCookieHeader(forwardedHeaders.cookie),
        }),
      );
    }

    const response = await fetch(`${API_URL}/api/auth/get-session`, {
      method: 'GET',
      headers: {
        ...forwardedHeaders,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (IS_DEVELOPMENT) {
      console.log(
        '[portal auth] getSession response',
        JSON.stringify({ status: response.status }),
      );
    }

    if (!response.ok) return null;

    const data = await response.json();
    return data as Session;
  } catch (error) {
    if (IS_DEVELOPMENT) {
      console.error('[auth] Failed to get session:', error);
    }
    return null;
  }
}

/**
 * Set the active organization for the current session.
 * Calls the API's better-auth organization endpoint so both
 * server and client session state stay in sync.
 */
async function setActiveOrganization(options: {
  headers: ReadonlyHeaders | Headers;
  body: { organizationId: string };
}): Promise<void> {
  try {
    const forwardedHeaders = headersToObject(options.headers);
    const origin = getRequestOrigin(options.headers);
    const response = await fetch(`${API_URL}/api/auth/organization/set-active`, {
      method: 'POST',
      headers: {
        ...forwardedHeaders,
        'Content-Type': 'application/json',
        Origin: origin,
        Referer: `${origin}/`,
      },
      body: JSON.stringify({ organizationId: options.body.organizationId }),
      cache: 'no-store',
    });

    if (!response.ok && IS_DEVELOPMENT) {
      console.error(
        '[auth] Failed to set active organization:',
        response.status,
        await response.text(),
      );
    }
  } catch (error) {
    if (IS_DEVELOPMENT) {
      console.error('[auth] Failed to set active organization:', error);
    }
  }
}

/**
 * Auth object matching the interface used throughout the portal.
 * All methods call the NestJS API — no local better-auth instance.
 */
export const auth = {
  api: {
    getSession,
    setActiveOrganization,
  },
};

// Type exports for backwards compatibility with files that imported from better-auth types
export type { Session as SessionType };
