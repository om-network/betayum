'use server';

import { db } from '@db/server';
import { revalidateTag } from 'next/cache';
import { authActionClient } from '../safe-action';
import { organizationAccessRequestFormSchema } from '../schema';

export const updateOrganizationAccessRequestFormAction = authActionClient
  .inputSchema(organizationAccessRequestFormSchema)
  .metadata({
    name: 'update-organization-access-request-form',
    track: {
      event: 'update-organization-access-request-form',
      channel: 'server',
    },
  })
  .action(async ({ parsedInput, ctx }) => {
    const { accessRequestFormEnabled } = parsedInput;
    const { organizationId } = ctx;

    if (!organizationId) {
      throw new Error('No active organization');
    }

    try {
      await db.organization.update({
        where: { id: organizationId },
        data: { accessRequestFormEnabled },
      });

      revalidateTag(`organization_${organizationId}`, 'max');

      return {
        success: true,
      };
    } catch (error) {
      console.error(error);
      throw new Error('Failed to update access request form setting');
    }
  });
