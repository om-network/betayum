import { env } from '@/env.mjs';
import { ACTIVE_ORGANIZATION_COOKIE } from '@/lib/active-organization';
import { headers } from 'next/headers';

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  status: number;
}

interface CallOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  organizationId?: string;
}

/**
 * Server-side API client for calling our internal NestJS API from server components.
 * Forwards Clerk cookies for authentication; the API resolves the Comp AI user
 * and validates organization access.
 */
async function call<T = unknown>(
  endpoint: string,
  options: CallOptions = {},
): Promise<ApiResponse<T>> {
  const { method = 'GET', body, organizationId } = options;
  const baseUrl = env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Forward cookies for auth - API validates the Clerk session.
  const headerStore = await headers();
  const cookieHeader = headerStore.get('cookie');
  if (cookieHeader) {
    requestHeaders['Cookie'] = cookieHeader;
  }
  const activeOrganizationId =
    organizationId || headerStore.get('x-organization-id') || getCookieValue(cookieHeader);

  if (activeOrganizationId) {
    requestHeaders['X-Organization-Id'] = activeOrganizationId;
  }

  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });

    let data = null;
    if (response.status !== 204) {
      const text = await response.text();
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = { message: text };
        }
      }
    }

    return {
      data: response.ok ? data : undefined,
      error: !response.ok ? data?.message || `HTTP ${response.status}` : undefined,
      status: response.status,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Network error',
      status: 0,
    };
  }
}

function getCookieValue(cookieHeader: string | null, name = ACTIVE_ORGANIZATION_COOKIE) {
  if (!cookieHeader) {
    return undefined;
  }

  const prefix = `${name}=`;
  const match = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  if (!match) {
    return undefined;
  }

  const value = match.slice(prefix.length);
  return value ? decodeURIComponent(value) : undefined;
}

export const serverApi = {
  get: <T = unknown>(endpoint: string, organizationId?: string) =>
    call<T>(endpoint, { method: 'GET', organizationId }),

  post: <T = unknown>(endpoint: string, body?: unknown, organizationId?: string) =>
    call<T>(endpoint, { method: 'POST', body, organizationId }),

  put: <T = unknown>(endpoint: string, body?: unknown, organizationId?: string) =>
    call<T>(endpoint, { method: 'PUT', body, organizationId }),

  patch: <T = unknown>(endpoint: string, body?: unknown, organizationId?: string) =>
    call<T>(endpoint, { method: 'PATCH', body, organizationId }),

  delete: <T = unknown>(endpoint: string, body?: unknown, organizationId?: string) =>
    call<T>(endpoint, { method: 'DELETE', body, organizationId }),
};
