'use server';

import { db } from '@db/server';
import { revalidateTag } from 'next/cache';
import { authActionClient } from '../safe-action';
import { organizationEvidenceApprovalSchema } from '../schema';

export const updateOrganizationEvidenceApprovalAction = authActionClient
  .inputSchema(organizationEvidenceApprovalSchema)
  .metadata({
    name: 'update-organization-evidence-approval',
    track: {
      event: 'update-organization-evidence-approval',
      channel: 'server',
    },
  })
  .action(async ({ parsedInput, ctx }) => {
    const { evidenceApprovalEnabled } = parsedInput;
    const { organizationId } = ctx;

    if (!organizationId) {
      throw new Error('No active organization');
    }

    try {
      await db.organization.update({
        where: { id: organizationId },
        data: { evidenceApprovalEnabled },
      });

      revalidateTag(`organization_${organizationId}`, 'max');

      return {
        success: true,
      };
    } catch (error) {
      console.error(error);
      throw new Error('Failed to update evidence approval setting');
    }
  });
