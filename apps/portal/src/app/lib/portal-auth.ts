import { auth as clerkAuth } from '@clerk/nextjs/server';
import type { ReadonlyHeaders } from 'next/dist/server/web/spec-extension/adapters/headers';
import { z } from 'zod';

const API_URL =
  process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';

const PortalUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  image: z.string().nullable(),
  role: z.string().nullable(),
});

const PortalOrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  logo: z.string().nullable(),
  onboardingCompleted: z.boolean(),
  hasAccess: z.boolean(),
  createdAt: z.unknown(),
  memberRole: z.string(),
  memberId: z.string(),
});

const MeResponseSchema = z.object({
  user: PortalUserSchema.nullable(),
  organizations: z.array(PortalOrganizationSchema),
});

export type PortalUser = z.infer<typeof PortalUserSchema>;
export type PortalOrganization = z.infer<typeof PortalOrganizationSchema>;

export interface PortalAuthContext {
  user: PortalUser;
  organizations: PortalOrganization[];
}

function forwardAuthHeaders(headers: ReadonlyHeaders | Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (lowerKey === 'cookie' || lowerKey.startsWith('x-')) {
      result[key] = value;
    }
  });
  return result;
}

export async function getPortalAuthContext(options: {
  headers: ReadonlyHeaders | Headers;
}): Promise<PortalAuthContext | null> {
  const { userId } = await clerkAuth();
  if (!userId) {
    return null;
  }

  const response = await fetch(`${API_URL}/v1/auth/me`, {
    method: 'GET',
    headers: {
      ...forwardAuthHeaders(options.headers),
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    return null;
  }

  const parsed = MeResponseSchema.safeParse(await response.json());
  if (!parsed.success || !parsed.data.user) {
    return null;
  }

  return {
    user: parsed.data.user,
    organizations: parsed.data.organizations,
  };
}

export function getPortalOrganization(
  context: PortalAuthContext,
  organizationId: string,
): PortalOrganization | null {
  return context.organizations.find((organization) => organization.id === organizationId) ?? null;
}
