import { BadRequestException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { db } from '@db';
import { ClerkOrganizationManagementService } from './clerk-organization-management.service';
import { normalizeClerkRoleKey } from './clerk-role-mapping';
import {
  collectUnmappedPermissions,
  isMembershipDeletedEvent,
  isMembershipUpsertEvent,
  isOrganizationEvent,
  toClerkRoleKey,
  toLocalRole,
} from './clerk-reconciliation.helpers';
import type {
  ClerkReconciliationReport,
  ClerkWebhookResult,
} from './clerk-reconciliation.types';

const ClerkEventSchema = z.object({
  type: z.string(),
  data: z.unknown(),
});

const OrganizationDataSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  public_metadata: z.record(z.string(), z.unknown()).optional(),
});

const MembershipDataSchema = z.object({
  id: z.string(),
  role: z.string().nullable().optional(),
  organization: z.object({ id: z.string() }),
  public_user_data: z.object({
    user_id: z.string(),
    identifier: z.string().nullable().optional(),
  }),
});

@Injectable()
export class ClerkReconciliationService {
  constructor(
    private readonly clerkOrganizations: ClerkOrganizationManagementService,
  ) {}

  async handleWebhookEvent(event: unknown): Promise<ClerkWebhookResult> {
    const parsed = ClerkEventSchema.safeParse(event);
    if (!parsed.success) {
      throw new BadRequestException('Invalid Clerk webhook event.');
    }

    if (isOrganizationEvent(parsed.data.type)) {
      return this.handleOrganizationEvent(parsed.data.data);
    }
    if (isMembershipUpsertEvent(parsed.data.type)) {
      return this.handleMembershipUpsert(parsed.data.data);
    }
    if (isMembershipDeletedEvent(parsed.data.type)) {
      return this.handleMembershipDeleted(parsed.data.data);
    }

    return { handled: false, issues: [] };
  }

  async reconcileOrganization(
    organizationId: string,
  ): Promise<ClerkReconciliationReport> {
    const organization = await db.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        clerkOrganizationId: true,
        members: {
          select: {
            id: true,
            role: true,
            clerkUserId: true,
            clerkOrganizationId: true,
            clerkMembershipId: true,
            deactivated: true,
          },
        },
        invitations: {
          where: { status: 'pending' },
          select: { id: true, email: true },
        },
        organizationRoles: {
          select: { name: true, permissions: true },
        },
      },
    });

    if (!organization) {
      throw new BadRequestException('Organization not found.');
    }

    const report: ClerkReconciliationReport = {
      organizationId,
      clerkOrganizationId: organization.clerkOrganizationId,
      missingLocalLinks: [],
      orphanedLocalProfiles: [],
      roleMismatches: [],
      invitationDrift: organization.invitations.map(
        (invite) => `${invite.id}:${invite.email}`,
      ),
      unmappedPermissions: collectUnmappedPermissions(
        organization.organizationRoles,
      ),
    };

    if (!organization.clerkOrganizationId) {
      report.missingLocalLinks.push(`organization:${organizationId}`);
      return report;
    }

    const clerkMemberships =
      await this.clerkOrganizations.listMemberships(organizationId);
    const clerkByUserId = new Map(
      clerkMemberships.map((membership) => [
        membership.clerkUserId,
        membership,
      ]),
    );

    for (const membership of clerkMemberships) {
      const localMember = organization.members.find(
        (member) => member.clerkUserId === membership.clerkUserId,
      );
      if (!localMember) {
        report.missingLocalLinks.push(
          `member:${membership.clerkUserId}:${membership.id}`,
        );
      }
    }

    for (const member of organization.members) {
      if (member.deactivated) continue;
      if (!member.clerkUserId || !member.clerkMembershipId) {
        report.missingLocalLinks.push(`member:${member.id}`);
        continue;
      }
      if (member.clerkOrganizationId !== organization.clerkOrganizationId) {
        report.orphanedLocalProfiles.push(`member:${member.id}`);
        continue;
      }

      const clerkMembership = clerkByUserId.get(member.clerkUserId);
      if (!clerkMembership) {
        report.orphanedLocalProfiles.push(`member:${member.id}`);
        continue;
      }

      const localRole = toClerkRoleKey(member.role);
      const clerkRole = normalizeClerkRoleKey(clerkMembership.role);
      if (localRole !== clerkRole) {
        report.roleMismatches.push({
          memberId: member.id,
          clerkUserId: member.clerkUserId,
          localRole,
          clerkRole,
        });
      }
    }

    return report;
  }

  private async handleOrganizationEvent(
    data: unknown,
  ): Promise<ClerkWebhookResult> {
    const organization = OrganizationDataSchema.parse(data);
    const compAiOrganizationId =
      typeof organization.public_metadata?.compAiOrganizationId === 'string'
        ? organization.public_metadata.compAiOrganizationId
        : null;

    const existing = await db.organization.findUnique({
      where: { clerkOrganizationId: organization.id },
      select: { id: true },
    });
    if (existing) {
      await db.organization.update({
        where: { id: existing.id },
        data: organization.name ? { name: organization.name } : {},
      });
      return { handled: true, issues: [] };
    }

    if (!compAiOrganizationId) {
      return {
        handled: true,
        issues: [`missing-local-organization:${organization.id}`],
      };
    }

    await db.organization.update({
      where: { id: compAiOrganizationId },
      data: {
        clerkOrganizationId: organization.id,
        ...(organization.name ? { name: organization.name } : {}),
      },
    });

    return { handled: true, issues: [] };
  }

  private async handleMembershipUpsert(
    data: unknown,
  ): Promise<ClerkWebhookResult> {
    const membership = MembershipDataSchema.parse(data);
    const organization = await db.organization.findUnique({
      where: { clerkOrganizationId: membership.organization.id },
      select: { id: true },
    });
    if (!organization) {
      return {
        handled: true,
        issues: [`missing-local-organization:${membership.organization.id}`],
      };
    }

    const user = await db.user.findUnique({
      where: { clerkUserId: membership.public_user_data.user_id },
      select: { id: true },
    });
    if (!user) {
      return {
        handled: true,
        issues: [`missing-local-user:${membership.public_user_data.user_id}`],
      };
    }

    const existingMember = await db.member.findFirst({
      where: {
        OR: [
          { clerkMembershipId: membership.id },
          { organizationId: organization.id, userId: user.id },
        ],
      },
      select: { id: true },
    });

    const role = toLocalRole(membership.role);
    const memberData = {
      role,
      clerkUserId: membership.public_user_data.user_id,
      clerkOrganizationId: membership.organization.id,
      clerkMembershipId: membership.id,
      isActive: true,
      deactivated: false,
    };

    if (existingMember) {
      await db.member.update({
        where: { id: existingMember.id },
        data: memberData,
      });
    } else {
      await db.member.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          ...memberData,
        },
      });
    }

    return { handled: true, issues: [] };
  }

  private async handleMembershipDeleted(
    data: unknown,
  ): Promise<ClerkWebhookResult> {
    const membership = MembershipDataSchema.parse(data);
    await db.member.updateMany({
      where: {
        clerkOrganizationId: membership.organization.id,
        clerkUserId: membership.public_user_data.user_id,
        deactivated: false,
      },
      data: {
        isActive: false,
        deactivated: true,
        clerkMembershipId: null,
        offboardDate: new Date(),
      },
    });

    return { handled: true, issues: [] };
  }
}
