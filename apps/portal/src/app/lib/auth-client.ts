'use client';

import { useAuth } from '@clerk/nextjs';
import useSWR from 'swr';

type SocialProvider = 'google' | 'microsoft';
type OAuthStrategy = 'oauth_google' | 'oauth_microsoft';
type AuthClientError = { message?: string } | null;

interface ClerkBrowser {
  signOut: (options?: { redirectUrl?: string }) => Promise<void>;
  redirectToSignIn: (options?: {
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
  google: 'oauth_google',
  microsoft: 'oauth_microsoft',
};

async function fetchJson<T>(path: string): Promise<T | null> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';
  const response = await fetch(`${baseUrl}${path}`, {
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

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';
  const response = await fetch(`${baseUrl}${path}`, {
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

function getBrowserClerk(): ClerkBrowser | null {
  if (typeof window === 'undefined') return null;
  return (window as Window & { Clerk?: ClerkBrowser }).Clerk ?? null;
}

export function useSession() {
  const { isLoaded, isSignedIn } = useAuth();
  return useSWR(
    isLoaded && isSignedIn ? 'portal-session' : null,
    () => fetchJson('/api/auth/get-full-session'),
    { revalidateOnFocus: false },
  );
}

export function useActiveOrganization() {
  const session = useSession();
  return {
    ...session,
    data: (session.data as { activeOrganization?: unknown } | null)?.activeOrganization ?? null,
  };
}

export function useActiveMember() {
  const session = useSession();
  return {
    ...session,
    data: (session.data as { activeMember?: unknown } | null)?.activeMember ?? null,
  };
}

export function useListOrganizations() {
  const { isLoaded, isSignedIn } = useAuth();
  return useSWR(
    isLoaded && isSignedIn ? 'portal-organizations' : null,
    () => fetchJson('/api/auth/organization/list'),
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
  signIn: {
    async social(params: { provider: SocialProvider; callbackURL?: string }) {
      const clerk = getBrowserClerk();
      const redirectUrlComplete = params.callbackURL ?? '/';

      if (clerk?.client?.signIn) {
        await clerk.client.signIn.authenticateWithRedirect({
          strategy: PROVIDER_STRATEGY[params.provider],
          redirectUrl: '/sso-callback',
          redirectUrlComplete,
        });
        return;
      }

      await redirectToAuth(redirectUrlComplete);
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
  },
  useActiveOrganization,
  useActiveMember,
  useListOrganizations,
  useSession,
};

export const {
  signIn,
  signOut,
  useActiveOrganization: useActiveOrganizationHook,
  organization,
  useListOrganizations: useListOrganizationsHook,
  useActiveMember: useActiveMemberHook,
} = authClient;
