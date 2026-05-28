'use server';

import { maskEmailForLogs } from '@/lib/mask-email';
import { serverApi } from '@/lib/api-server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { z } from 'zod';
import { authActionClient } from '../safe-action';
import type { ActionResponse } from '../types';

const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['owner', 'admin', 'auditor', 'employee', 'contractor']),
});

export const inviteMember = authActionClient
  .metadata({
    name: 'invite-member',
    track: {
      event: 'invite_member',
      channel: 'organization',
    },
  })
  .inputSchema(inviteMemberSchema)
  .action(async ({ parsedInput, ctx }): Promise<ActionResponse<{ invited: boolean }>> => {
    const { organizationId } = ctx;
    const requestId = crypto.randomUUID();

    if (!organizationId) {
      console.warn('[inviteMember] missing organization', { requestId });
      return {
        success: false,
        error: 'Organization not found',
      };
    }

    const { email, role } = parsedInput;
    const safeEmail = maskEmailForLogs(email);
    const startTime = Date.now();

    console.info('[inviteMember] start', {
      requestId,
      organizationId,
      invitedEmail: safeEmail,
      role,
    });

    try {
      const inviteResult = await serverApi.post('/v1/people/invite', {
        invites: [{ email, roles: [role] }],
      }, organizationId);

      if (inviteResult.error) {
        throw new Error(inviteResult.error);
      }

      const resultKeys = inviteResult.data && typeof inviteResult.data === 'object'
        ? Object.keys(inviteResult.data)
        : [];

      revalidatePath(`/${organizationId}/settings/users`);
      revalidateTag(`user_${ctx.user!.id}`, 'max');

      console.info('[inviteMember] success', {
        requestId,
        organizationId,
        invitedEmail: safeEmail,
        role,
        durationMs: Date.now() - startTime,
        resultKeys,
      });

      return {
        success: true,
        data: { invited: true },
      };
    } catch (error) {
      console.error('[inviteMember] failure', {
        requestId,
        organizationId,
        invitedEmail: safeEmail,
        role,
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      });
      const errorMessage = error instanceof Error ? error.message : 'Failed to invite member';
      return {
        success: false,
        error: errorMessage,
      };
    }
  });
