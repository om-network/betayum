/**
 * Server-side auth utilities for the Framework Editor.
 *
 * Proxies session checks to the API's auth endpoints.
 * The actual auth server runs on the API -- this app only consumes auth services.
 *
 * For browser-side auth (login, logout, hooks), use auth-client.ts instead.
 */

import type { ReadonlyHeaders } from 'next/dist/server/web/spec-extension/adapters/headers';

const API_URL =
  process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';

const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';

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

function headersToObject(headers: ReadonlyHeaders | Headers): Record<string, string> {
  const obj: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (key.toLowerCase() === 'cookie') {
      obj[key] = value;
    }
  });
  return obj;
}

async function getSession(options: {
  headers: ReadonlyHeaders | Headers;
}): Promise<Session | null> {
  try {
    const response = await fetch(`${API_URL}/v1/auth/me`, {
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

    const data = (await response.json()) as { user: Session['user'] | null };
    if (!data.user) {
      return null;
    }

    return {
      session: {
        id: 'clerk-session',
        userId: data.user.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        token: '',
        createdAt: new Date(),
        updatedAt: new Date(),
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

export const auth = {
  api: {
    getSession,
  },
};
