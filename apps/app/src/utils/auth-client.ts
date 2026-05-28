'use client';

import { apiClient } from '@/lib/api-client';
import { useAuth } from '@clerk/nextjs';
import useSWR from 'swr';

type SessionResponse = Awaited<ReturnType<typeof fetchFullSession>>;
type OrganizationListResponse = Awaited<ReturnType<typeof fetchOrganizations>>;
type SocialProvider = 'google' | 'github' | 'microsoft';
type OAuthStrategy = 'oauth_google' | 'oauth_github' | 'oauth_microsoft';
type AuthClientError = { message?: string } | null;

interface ClerkBrowser {
  signOut: (options?: { redirectUrl?: string }) => Promise<void>;
  redirectToSignIn: (options?: {
    redirectUrl?: string;
    fallbackRedirectUrl?: string;
    forceRedirectUrl?: string;
  }) => Promise<unknown>;
  client?: {
    signIn?: {
      authenticateWithRedirect: (params: {
        strategy: OAuthStrategy;
        redirectUrl: string;
        redirectUrlComplete: string;
      }) => Promise<void>;
    };
  };
}

const PROVIDER_STRATEGY: Record<SocialProvider, OAuthStrategy> = {
  github: 'oauth_github',
  google: 'oauth_google',
  microsoft: 'oauth_microsoft',
};

async function fetchJson<T>(input: string): Promise<T | null> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';
  const response = await fetch(`${baseUrl}${input}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as T;
}

async function postJson<T>(input: string, body: unknown): Promise<T> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';
  const response = await fetch(`${baseUrl}${input}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

async function fetchFullSession() {
  return fetchJson<{
    session: {
      id: string;
      userId: string;
      activeOrganizationId?: string | null;
      impersonatedBy?: string;
    } | null;
    user: {
      id: string;
      email: string;
      name: string;
      role?: string | null;
    } | null;
    activeOrganization?: {
      id: string;
      name: string;
      slug?: string | null;
      logo?: string | null;
      createdAt: string;
    } | null;
    activeMember?: {
      id: string;
      organizationId: string;
      userId: string;
      role: string;
      createdAt: string;
    } | null;
  }>('/api/auth/get-full-session');
}

async function fetchOrganizations() {
  return (
    (await fetchJson<
      Array<{
        id: string;
        name: string;
        slug?: string | null;
        logo?: string | null;
        createdAt: string;
      }>
    >('/api/auth/organization/list')) ?? []
  );
}

function getBrowserClerk(): ClerkBrowser | null {
  if (typeof window === 'undefined') return null;
  return (window as Window & { Clerk?: ClerkBrowser }).Clerk ?? null;
}

export function useSession() {
  const { isLoaded, isSignedIn } = useAuth();
  return useSWR<SessionResponse>(
    isLoaded && isSignedIn ? 'clerk-session' : null,
    fetchFullSession,
    { revalidateOnFocus: false },
  );
}

export function useActiveOrganization() {
  const session = useSession();
  return {
    ...session,
    data: session.data?.activeOrganization ?? null,
  };
}

export function useActiveMember() {
  const session = useSession();
  return {
    ...session,
    data: session.data?.activeMember ?? null,
  };
}

export function useListOrganizations() {
  const { isLoaded, isSignedIn } = useAuth();
  return useSWR<OrganizationListResponse>(
    isLoaded && isSignedIn ? 'clerk-organizations' : null,
    fetchOrganizations,
    { revalidateOnFocus: false },
  );
}

async function redirectToAuth(callbackURL?: string) {
  const clerk = getBrowserClerk();
  if (!clerk) {
    window.location.href = callbackURL
      ? `/auth?redirectTo=${encodeURIComponent(callbackURL)}`
      : '/auth';
    return;
  }

  await clerk.redirectToSignIn({
    fallbackRedirectUrl: callbackURL,
    forceRedirectUrl: callbackURL,
  });
}

export const authClient = {
  useActiveMember,
  useActiveOrganization,
  useListOrganizations,
  useSession,
  signIn: {
    async social(params: { provider: SocialProvider; callbackURL?: string }) {
      const clerk = getBrowserClerk();
      const strategy = PROVIDER_STRATEGY[params.provider];
      const redirectUrlComplete = params.callbackURL ?? '/';

      if (clerk?.client?.signIn) {
        await clerk.client.signIn.authenticateWithRedirect({
          strategy,
          redirectUrl: '/sso-callback',
          redirectUrlComplete,
        });
        return;
      }

      await redirectToAuth(redirectUrlComplete);
    },
    async magicLink(_params?: unknown): Promise<{ error: AuthClientError }> {
      void _params;
      await redirectToAuth('/');
      return { error: null };
    },
    async emailOtp(_params?: unknown): Promise<{ error: AuthClientError }> {
      void _params;
      await redirectToAuth('/');
      return { error: null };
    },
  },
  emailOtp: {
    async sendVerificationOtp(_params?: unknown): Promise<{ data: null; error: AuthClientError }> {
      void _params;
      await redirectToAuth('/');
      return { data: null, error: null };
    },
  },
  async getSession() {
    return { data: await fetchFullSession() };
  },
  async signOut(options?: { fetchOptions?: { onSuccess?: () => void }; redirectTo?: string }) {
    const clerk = getBrowserClerk();
    if (clerk) {
      await clerk.signOut({ redirectUrl: options?.redirectTo });
    }
    options?.fetchOptions?.onSuccess?.();
  },
  organization: {
    async setActive({ organizationId }: { organizationId: string }) {
      return postJson('/api/auth/organization/set-active', { organizationId });
    },
    async updateMemberRole({ memberId, role }: { memberId: string; role: string[] }) {
      const response = await apiClient.patch(`/v1/people/${memberId}`, {
        role: role.join(','),
      });

      if (response.error) {
        throw new Error(response.error);
      }

      return response.data;
    },
  },
  admin: {
    async impersonateUser({ userId }: { userId: string }) {
      return postJson('/api/auth/admin/impersonate-user', { userId });
    },
    async stopImpersonating() {
      return postJson('/api/auth/admin/stop-impersonating', {});
    },
  },
  $store: {
    notify() {
      return undefined;
    },
  },
};

export const {
  signIn,
  signOut,
  useActiveOrganization: useActiveOrganizationHook,
  organization,
  useListOrganizations: useListOrganizationsHook,
  useActiveMember: useActiveMemberHook,
} = authClient;
