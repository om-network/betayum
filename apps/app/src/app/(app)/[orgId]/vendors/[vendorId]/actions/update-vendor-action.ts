// update-risk-action.ts

'use server';

import { authActionClient } from '@/actions/safe-action';
import { hasPermission } from '@/lib/permissions';
import { resolveCurrentUserOrganizationContext } from '@/lib/permissions.server';
import { db } from '@db/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { updateVendorSchema } from './schema';

export const updateVendorAction = authActionClient
  .inputSchema(updateVendorSchema)
  .metadata({
    name: 'update-vendor',
    track: {
      event: 'update-vendor',
      channel: 'server',
    },
  })
  .action(async ({ parsedInput }) => {
    const { organizationId, id, name, description, category, assigneeId, status, website, isSubProcessor } =
      parsedInput;
    const normalizedWebsite = website === '' ? null : website;

    const context = await resolveCurrentUserOrganizationContext(organizationId);
    if (!context || !hasPermission(context.permissions, 'vendor', 'update')) {
      throw new Error('Invalid user input');
    }

    try {
      await db.vendor.update({
        where: {
          id,
          organizationId,
        },
        data: {
          name,
          description,
          assigneeId,
          category,
          status,
          website: normalizedWebsite,
          isSubProcessor,
        },
      });

      revalidatePath(`/${organizationId}/vendors`);
      revalidatePath(`/${organizationId}/vendors/register`);
      revalidatePath(`/${organizationId}/vendors/${id}`);
      revalidateTag('vendors', 'max');

      return {
        success: true,
      };
    } catch (error) {
      console.error('Error updating vendor:', error);

      return {
        success: false,
      };
    }
  });
