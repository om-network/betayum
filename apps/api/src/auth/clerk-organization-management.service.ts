import { BadRequestException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { db } from '@db';
import { getClerkAuthConfig } from './clerk-auth.config';
import { resolveClerkRoleKey } from './clerk-role-mapping';

const CLERK_API_BASE_URL = 'https://api.clerk.com/v1';

const ClerkInvitationSchema = z.object({
  id: z.string(),
  email_address: z.string(),
  role: z.string().nullable().optional(),
  status: z.string(),
  expires_at: z.union([z.number(), z.string()]).nullable().optional(),
  created_at: z.union([z.number(), z.string()]).nullable().optional(),
});

const ClerkInvitationListSchema = z.object({
  data: z.array(ClerkInvitationSchema),
});

const ClerkMembershipSchema = z.object({
  id: z.string(),
  role: z.string().nullable().optional(),
  public_user_data: z
    .object({
      user_id: z.string().nullable().optional(),
      identifier: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});

const ClerkMembershipListSchema = z.object({
  data: z.array(ClerkMembershipSchema),
});

export interface ClerkInvitationView {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface ClerkMembershipView {
  id: string;
  clerkUserId: string;
  email: string | null;
  role: string;
}

@Injectable()
export class ClerkOrganizationManagementService {
  async createInvitation(params: {
    organizationId: string;
    email: string;
    roles: string[];
    inviterUserId: string;
    redirectUrl?: string;
  }): Promise<ClerkInvitationView> {
    const organization = await this.requireLinkedOrganization(
      params.organizationId,
    );
    const inviter = await db.user.findUnique({
      where: { id: params.inviterUserId },
      select: { clerkUserId: true },
    });

    const invitation = await this.request({
      path: `/organizations/${organization.clerkOrganizationId}/invitations`,
      method: 'POST',
      body: {
        email_address: params.email,
        role: resolveClerkRoleKey(params.roles),
        ...(params.redirectUrl ? { redirect_url: params.redirectUrl } : {}),
        ...(inviter?.clerkUserId
          ? { inviter_user_id: inviter.clerkUserId }
          : {}),
        public_metadata: {
          compAiOrganizationId: params.organizationId,
          compAiRoles: params.roles,
        },
      },
      schema: ClerkInvitationSchema,
    });

    return toInvitationView(invitation);
  }

  async listPendingInvitations(
    organizationId: string,
  ): Promise<ClerkInvitationView[]> {
    const organization = await this.requireLinkedOrganization(organizationId);
    const response = await this.request({
      path: `/organizations/${organization.clerkOrganizationId}/invitations/pending?limit=100`,
      method: 'GET',
      schema: ClerkInvitationListSchema,
    });

    return response.data.map(toInvitationView);
  }

  async listMemberships(
    organizationId: string,
  ): Promise<ClerkMembershipView[]> {
    const organization = await this.requireLinkedOrganization(organizationId);
    const response = await this.request({
      path: `/organizations/${organization.clerkOrganizationId}/memberships?limit=100`,
      method: 'GET',
      schema: ClerkMembershipListSchema,
    });

    return response.data
      .map(toMembershipView)
      .filter((membership): membership is ClerkMembershipView => !!membership);
  }

  async revokeInvitation(params: {
    organizationId: string;
    invitationId: string;
  }): Promise<void> {
    const organization = await this.requireLinkedOrganization(
      params.organizationId,
    );

    await this.request({
      path: `/organizations/${organization.clerkOrganizationId}/invitations/${params.invitationId}/revoke`,
      method: 'POST',
      schema: ClerkInvitationSchema,
    });
  }

  async updateMembershipRole(params: {
    organizationId: string;
    clerkUserId: string | null;
    roles: string[];
  }): Promise<void> {
    if (!params.clerkUserId) {
      throw new BadRequestException(
        'Member is not linked to a Clerk user and cannot be updated.',
      );
    }

    const organization = await this.requireLinkedOrganization(
      params.organizationId,
    );

    await this.request({
      path: `/organizations/${organization.clerkOrganizationId}/memberships/${params.clerkUserId}`,
      method: 'PATCH',
      body: { role: resolveClerkRoleKey(params.roles) },
      schema: z.unknown(),
    });
  }

  async removeMembership(params: {
    organizationId: string;
    clerkUserId: string | null;
  }): Promise<void> {
    if (!params.clerkUserId) {
      throw new BadRequestException(
        'Member is not linked to a Clerk user and cannot be removed.',
      );
    }

    const organization = await this.requireLinkedOrganization(
      params.organizationId,
    );

    await this.request({
      path: `/organizations/${organization.clerkOrganizationId}/memberships/${params.clerkUserId}`,
      method: 'DELETE',
      schema: z.unknown(),
    });
  }

  private async requireLinkedOrganization(organizationId: string): Promise<{
    clerkOrganizationId: string;
  }> {
    const organization = await db.organization.findUnique({
      where: { id: organizationId },
      select: { clerkOrganizationId: true },
    });

    if (!organization?.clerkOrganizationId) {
      throw new BadRequestException(
        'Organization is not linked to a Clerk organization.',
      );
    }

    return { clerkOrganizationId: organization.clerkOrganizationId };
  }

  private async request<TSchema extends z.ZodType>(params: {
    path: string;
    method: 'DELETE' | 'GET' | 'PATCH' | 'POST';
    body?: Record<string, unknown>;
    schema: TSchema;
  }): Promise<z.output<TSchema>> {
    const { secretKey } = getClerkAuthConfig();
    const response = await fetch(`${CLERK_API_BASE_URL}${params.path}`, {
      method: params.method,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      ...(params.body ? { body: JSON.stringify(params.body) } : {}),
    });

    const responseBody = await response.text();
    if (!response.ok) {
      throw new BadRequestException(
        responseBody || 'Clerk organization request failed.',
      );
    }

    const payload = parseClerkResponseBody(responseBody);
    const parsed = params.schema.safeParse(payload);
    if (!parsed.success) {
      throw new BadRequestException('Unexpected Clerk API response.');
    }

    return parsed.data;
  }
}

function toInvitationView(
  invitation: z.output<typeof ClerkInvitationSchema>,
): ClerkInvitationView {
  return {
    id: invitation.id,
    email: invitation.email_address,
    role: invitation.role ?? 'org:member',
    status: invitation.status,
    expiresAt: toDate(invitation.expires_at),
    createdAt: toDate(invitation.created_at) ?? new Date(0),
  };
}

function toMembershipView(
  membership: z.output<typeof ClerkMembershipSchema>,
): ClerkMembershipView | null {
  const clerkUserId = membership.public_user_data?.user_id;
  if (!clerkUserId) return null;

  return {
    id: membership.id,
    clerkUserId,
    email: membership.public_user_data?.identifier ?? null,
    role: membership.role ?? 'org:member',
  };
}

function toDate(value: number | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return new Date(value);
  return new Date(value);
}

function parseClerkResponseBody(responseBody: string): unknown {
  if (!responseBody) return null;

  try {
    return JSON.parse(responseBody);
  } catch {
    throw new BadRequestException('Clerk API returned invalid JSON.');
  }
}
