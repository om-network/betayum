'use server';

import { db } from '@db/server';
import { revalidateTag } from 'next/cache';
import { authActionClient } from '../safe-action';
import { organizationWhistleblowerReportSchema } from '../schema';

export const updateOrganizationWhistleblowerReportAction = authActionClient
  .inputSchema(organizationWhistleblowerReportSchema)
  .metadata({
    name: 'update-organization-whistleblower-report',
    track: {
      event: 'update-organization-whistleblower-report',
      channel: 'server',
    },
  })
  .action(async ({ parsedInput, ctx }) => {
    const { whistleblowerReportEnabled } = parsedInput;
    const { organizationId } = ctx;

    if (!organizationId) {
      throw new Error('No active organization');
    }

    try {
      await db.organization.update({
        where: { id: organizationId },
        data: { whistleblowerReportEnabled },
      });

      revalidateTag(`organization_${organizationId}`, 'max');

      return {
        success: true,
      };
    } catch (error) {
      console.error(error);
      throw new Error('Failed to update whistleblower report setting');
    }
  });
