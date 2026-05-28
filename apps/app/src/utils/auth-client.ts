'use client';

import { apiClient } from '@/lib/api-client';
import { ACTIVE_ORGANIZATION_COOKIE } from '@/lib/active-organization';
import type {
  ActiveOrganization,
  Member,
  Organization,
  Session,
} from '@/utils/auth';
import useSWR from 'swr';

type MeResponse = {
  user: Session['user'] | null;
  organizations: Array<
    Organization & {
      memberRole: string;
      memberId: string;
    }
  >;
  pendingInvitation: { id: string } | null;
};

function getActiveOrganizationId(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const prefix = `${ACTIVE_ORGANIZATION_COOKIE}=`;
  const match = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  if (!match) {
    return null;
  }

  const value = match.slice(prefix.length);
  return value ? decodeURIComponent(value) : null;
}

function setActiveOrganizationId(organizationId: string): void {
  document.cookie = `${ACTIVE_ORGANIZATION_COOKIE}=${encodeURIComponent(organizationId)}; path=/; samesite=lax`;
}

async function fetchMe(): Promise<MeResponse | null> {
  const response = await apiClient.get<MeResponse>('/v1/auth/me');
  return response.data ?? null;
}

function buildSession(data: MeResponse | null): Session | null {
  if (!data?.user) {
    return null;
  }

  const activeOrganizationId =
    getActiveOrganizationId() ?? data.organizations[0]?.id ?? null;

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
}

function buildActiveOrganization(data: MeResponse | null): ActiveOrganization | null {
  const activeOrganizationId =
    getActiveOrganizationId() ?? data?.organizations[0]?.id ?? null;

  if (!activeOrganizationId || !data) {
    return null;
  }

  const organization = data.organizations.find((item) => item.id === activeOrganizationId);
  if (!organization) {
    return null;
  }

  return organization;
}

function buildActiveMember(data: MeResponse | null): Member | null {
  const activeOrganization = buildActiveOrganization(data);
  if (!activeOrganization || !data) {
    return null;
  }

  const organization = data.organizations.find((item) => item.id === activeOrganization.id);
  if (!organization || !data.user) {
    return null;
  }

  return {
    id: organization.memberId,
    organizationId: organization.id,
    userId: data.user.id,
    role: organization.memberRole,
    createdAt: new Date(organization.createdAt),
  };
}

export const authClient = {
  signIn: {
    social: async ({ callbackURL }: { provider: string; callbackURL?: string }) => {
      if (typeof window !== 'undefined') {
        const redirectTo = callbackURL ? `?redirectTo=${encodeURIComponent(callbackURL)}` : '';
        window.location.assign(`/auth${redirectTo}`);
      }

      return { error: null };
    },
    magicLink: async ({
      callbackURL,
    }: {
      email: string;
      callbackURL?: string;
    }) => {
      if (typeof window !== 'undefined') {
        const redirectTo = callbackURL ? `?redirectTo=${encodeURIComponent(callbackURL)}` : '';
        window.location.assign(`/auth${redirectTo}`);
      }

      return { error: null };
    },
  },
  organization: {
    setActive: async ({ organizationId }: { organizationId: string }) => {
      setActiveOrganizationId(organizationId);
      return { data: { organizationId }, error: null };
    },
    updateMemberRole: async ({
      memberId,
      role,
    }: {
      memberId: string;
      role: string[];
    }) => {
      const response = await apiClient.patch(`/v1/people/${memberId}`, {
        role: role.join(','),
      });

      if (response.error) {
        throw new Error(response.error);
      }

      return { data: response.data, error: null };
    },
  },
  useActiveMember: () => {
    const swr = useSWR('auth:me', fetchMe, { revalidateOnFocus: false });
    return { ...swr, data: buildActiveMember(swr.data ?? null) };
  },
  signOut: async ({
    fetchOptions,
  }: {
    fetchOptions?: { onSuccess?: () => void };
  } = {}) => {
    if (typeof document !== 'undefined') {
      document.cookie = `${ACTIVE_ORGANIZATION_COOKIE}=; path=/; max-age=0; samesite=lax`;
    }

    fetchOptions?.onSuccess?.();
    return { error: null };
  },
};

export function useSession() {
  const swr = useSWR('auth:me', fetchMe, { revalidateOnFocus: false });
  return { ...swr, data: buildSession(swr.data ?? null) };
}

export function useActiveOrganization() {
  const swr = useSWR('auth:me', fetchMe, { revalidateOnFocus: false });
  return { ...swr, data: buildActiveOrganization(swr.data ?? null) };
}

export function useListOrganizations() {
  const swr = useSWR('auth:me', fetchMe, { revalidateOnFocus: false });
  return { ...swr, data: swr.data?.organizations ?? [] };
}

export function useActiveMember() {
  return authClient.useActiveMember();
}

export const signIn = authClient.signIn;
export const signOut = authClient.signOut;
export const organization = authClient.organization;
