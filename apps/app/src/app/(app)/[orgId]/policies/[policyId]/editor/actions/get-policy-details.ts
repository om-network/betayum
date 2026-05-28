'use server';

import { authActionClient } from '@/actions/safe-action';
import { hasPermission } from '@/lib/permissions';
import { resolveCurrentUserOrganizationContext } from '@/lib/permissions.server';
import { db } from '@db/server';
import { appErrors, policyDetailsInputSchema } from '../types';

export const getPolicyDetails = authActionClient
  .inputSchema(policyDetailsInputSchema)
  .metadata({
    name: 'get-policy-details',
    track: {
      event: 'get-policy-details',
      channel: 'server',
    },
  })
  .action(async ({ parsedInput }) => {
    const { organizationId, policyId } = parsedInput;

    const context = await resolveCurrentUserOrganizationContext(organizationId);
    if (!context || !hasPermission(context.permissions, 'policy', 'read')) {
      return {
        success: false,
        error: appErrors.UNAUTHORIZED.message,
      };
    }

    try {
      const policy = await db.policy.findUnique({
        where: {
          id: policyId,
          organizationId,
        },
      });

      if (!policy) {
        return {
          success: false,
          error: appErrors.NOT_FOUND.message,
        };
      }

      return {
        success: true,
        data: policy,
      };
    } catch (error) {
      console.error('Error fetching policy details:', error);
      return {
        success: false,
        error: appErrors.UNEXPECTED_ERROR.message,
      };
    }
  });
