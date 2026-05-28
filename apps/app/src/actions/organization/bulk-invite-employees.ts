'use server';

import { maskEmailForLogs } from '@/lib/mask-email';
import { serverApi } from '@/lib/api-server';
import { z } from 'zod';
import { authActionClient } from '../safe-action';

const emailSchema = z.string().email({ message: 'Invalid email format' });

const schema = z.object({
  organizationId: z.string(),
  emails: z.array(emailSchema).min(1, { message: 'At least one email is required.' }),
});

interface InviteResult {
  email: string;
  success: boolean;
  error?: string;
}

export const bulkInviteEmployees = authActionClient
  .inputSchema(schema)
  .metadata({
    name: 'bulk-invite-employees',
    track: {
      event: 'bulk_invite_employees',
      channel: 'organization',
    },
  })
  .action(async ({ parsedInput, ctx }) => {
    const { organizationId, emails } = parsedInput;
    const requestId = crypto.randomUUID();
    const startTime = Date.now();

    if (ctx.organizationId !== organizationId) {
      console.warn('[bulkInviteEmployees] unauthorized', { requestId, organizationId });
      return {
        success: false,
        error: 'Unauthorized or invalid organization.',
      };
    }

    const results: InviteResult[] = [];
    let allSuccess = true;

    console.info('[bulkInviteEmployees] start', {
      requestId,
      organizationId,
      count: emails.length,
    });

    for (const email of emails) {
      try {
        const inviteResult = await serverApi.post('/v1/people/invite', {
          invites: [{ email, roles: ['employee'] }],
        }, organizationId);

        if (inviteResult.error) {
          throw new Error(inviteResult.error);
        }

        results.push({ email, success: true });
      } catch (error) {
        allSuccess = false;
        console.error('[bulkInviteEmployees] invite failed', {
          requestId,
          organizationId,
          invitedEmail: maskEmailForLogs(email),
          error: error instanceof Error ? error.message : String(error),
        });
        const errorMessage = error instanceof Error ? error.message : 'Invitation failed';
        results.push({ email, success: false, error: errorMessage });
      }
    }

    console.info('[bulkInviteEmployees] complete', {
      requestId,
      organizationId,
      total: emails.length,
      successCount: results.filter((result) => result.success).length,
      failureCount: results.filter((result) => !result.success).length,
      durationMs: Date.now() - startTime,
    });

    return { success: true, data: results };
  });
