'use server';

import { db } from '@db/server';
import { revalidateTag } from 'next/cache';
import { authActionClient } from '../safe-action';
import { organizationSecurityTrainingStepSchema } from '../schema';

export const updateOrganizationSecurityTrainingStepAction = authActionClient
  .inputSchema(organizationSecurityTrainingStepSchema)
  .metadata({
    name: 'update-organization-security-training-step',
    track: {
      event: 'update-organization-security-training-step',
      channel: 'server',
    },
  })
  .action(async ({ parsedInput, ctx }) => {
    const { securityTrainingStepEnabled } = parsedInput;
    const { organizationId } = ctx;

    if (!organizationId) {
      throw new Error('No active organization');
    }

    try {
      await db.organization.update({
        where: { id: organizationId },
        data: { securityTrainingStepEnabled },
      });

      revalidateTag(`organization_${organizationId}`, 'max');

      return {
        success: true,
      };
    } catch (error) {
      console.error(error);
      throw new Error('Failed to update security training step setting');
    }
  });
