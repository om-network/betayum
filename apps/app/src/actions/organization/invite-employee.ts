'use server';

import { maskEmailForLogs } from '@/lib/mask-email';
import { serverApi } from '@/lib/api-server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { z } from 'zod';
import { authActionClient } from '../safe-action';
import type { ActionResponse } from '../types';

// Schema only needs email now
const inviteEmployeeSchema = z.object({
  email: z.string().email(),
});

export const inviteEmployee = authActionClient
  .metadata({
    name: 'invite-employee', // Updated name
    track: {
      event: 'invite_employee', // Updated event name
      channel: 'organization',
    },
  })
  .inputSchema(inviteEmployeeSchema)
  .action(async ({ parsedInput, ctx }): Promise<ActionResponse<{ invited: boolean }>> => {
    const { organizationId } = ctx;
    const requestId = crypto.randomUUID();

    if (!organizationId) {
      console.warn('[inviteEmployee] missing organization', { requestId });
      return {
        success: false,
        error: 'Organization not found',
      };
    }

    const { email } = parsedInput; // Role is removed from input
    const safeEmail = maskEmailForLogs(email);
    const startTime = Date.now();

    console.info('[inviteEmployee] start', {
      requestId,
      organizationId,
      invitedEmail: safeEmail,
      role: 'employee',
    });

    try {
      const inviteResult = await serverApi.post('/v1/people/invite', {
        invites: [{ email, roles: ['employee'] }],
      }, organizationId);

      if (inviteResult.error) {
        throw new Error(inviteResult.error);
      }

      const resultKeys = inviteResult.data && typeof inviteResult.data === 'object'
        ? Object.keys(inviteResult.data)
        : [];

      // Revalidate the employees list page
      revalidatePath(`/${organizationId}/people/all`);
      revalidateTag(`user_${ctx.user!.id}`, 'max'); // Keep user tag revalidation

      console.info('[inviteEmployee] success', {
        requestId,
        organizationId,
        invitedEmail: safeEmail,
        role: 'employee',
        durationMs: Date.now() - startTime,
        resultKeys,
      });

      return {
        success: true,
        data: { invited: true },
      };
    } catch (error) {
      console.error('[inviteEmployee] failure', {
        requestId,
        organizationId,
        invitedEmail: safeEmail,
        role: 'employee',
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      });
      const errorMessage = error instanceof Error ? error.message : 'Failed to invite employee';
      return {
        success: false,
        error: errorMessage,
      };
    }
  });
