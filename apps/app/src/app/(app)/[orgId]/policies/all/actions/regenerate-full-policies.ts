'use server';

import { authActionClient } from '@/actions/safe-action';
import { hasPermission } from '@/lib/permissions';
import { resolveCurrentUserOrganizationContext } from '@/lib/permissions.server';
import { generateFullPolicies } from '@/trigger/tasks/onboarding/generate-full-policies';
import { tasks } from '@trigger.dev/sdk';
import { z } from 'zod';

export const regenerateFullPoliciesAction = authActionClient
  .inputSchema(z.object({ organizationId: z.string() }))
  .metadata({
    name: 'regenerate-full-policies',
    track: {
      event: 'regenerate-full-policies',
      channel: 'server',
    },
  })
  .action(async ({ parsedInput }) => {
    const { organizationId } = parsedInput;
    const context = await resolveCurrentUserOrganizationContext(organizationId);
    if (!context || !hasPermission(context.permissions, 'policy', 'update')) {
      throw new Error('Unauthorized');
    }

    await tasks.trigger<typeof generateFullPolicies>('generate-full-policies', {
      organizationId,
    });

    // Revalidation handled by safe-action middleware using x-pathname header
    return { success: true };
  });
