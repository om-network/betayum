'use server';

import { db } from '@db/server';
import { revalidateTag } from 'next/cache';
import { authActionClient } from '../safe-action';
import { organizationDeviceAgentStepSchema } from '../schema';

export const updateOrganizationDeviceAgentStepAction = authActionClient
  .inputSchema(organizationDeviceAgentStepSchema)
  .metadata({
    name: 'update-organization-device-agent-step',
    track: {
      event: 'update-organization-device-agent-step',
      channel: 'server',
    },
  })
  .action(async ({ parsedInput, ctx }) => {
    const { deviceAgentStepEnabled } = parsedInput;
    const { organizationId } = ctx;

    if (!organizationId) {
      throw new Error('No active organization');
    }

    try {
      await db.organization.update({
        where: { id: organizationId },
        data: { deviceAgentStepEnabled },
      });

      revalidateTag(`organization_${organizationId}`, 'max');

      return {
        success: true,
      };
    } catch (error) {
      console.error(error);
      throw new Error('Failed to update device agent step setting');
    }
  });
