'use server';

import { db } from '@db/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { authActionClient } from '@/actions/safe-action';
import type { ActionResponse } from '@/actions/types';
import { hasPermission } from '@/lib/permissions';
import { resolveCurrentUserPermissions } from '@/lib/permissions.server';
import { getRequestOrganizationId } from '@/lib/request-organization';

const reactivateMemberSchema = z.object({
  memberId: z.string(),
});

export const reactivateMember = authActionClient
  .metadata({
    name: 'reactivate-member',
    track: {
      event: 'reactivate_member',
      channel: 'organization',
    },
  })
  .inputSchema(reactivateMemberSchema)
  .action(async ({ parsedInput }): Promise<ActionResponse<{ reactivated: boolean }>> => {
    const organizationId = await getRequestOrganizationId();
    if (!organizationId) {
      return {
        success: false,
        error: 'User does not have an organization',
      };
    }

    const { memberId } = parsedInput;

    try {
      const permissions = await resolveCurrentUserPermissions(organizationId);
      if (!permissions || !hasPermission(permissions, 'member', 'update')) {
        return {
          success: false,
          error: "You don't have permission to reactivate members",
        };
      }

      // Check if the target member exists and is deactivated
      const targetMember = await db.member.findFirst({
        where: {
          id: memberId,
          organizationId,
        },
        include: {
          user: true,
        },
      });

      if (!targetMember) {
        return {
          success: false,
          error: 'Member not found in this organization',
        };
      }

      if (!targetMember.deactivated && targetMember.isActive) {
        return {
          success: false,
          error: 'Member is already active',
        };
      }

      // Reactivate the member
      await db.member.update({
        where: {
          id: memberId,
        },
        data: {
          deactivated: false,
          isActive: true,
        },
      });

      revalidatePath(`/${organizationId}/people`);
      revalidatePath(`/${organizationId}/people/${memberId}`);

      return {
        success: true,
        data: { reactivated: true },
      };
    } catch (error) {
      console.error('Error reactivating member:', error);
      return {
        success: false,
        error: 'Failed to reactivate member',
      };
    }
  });
