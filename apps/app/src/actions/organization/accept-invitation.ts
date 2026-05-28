'use server';

import { z } from 'zod';
import { actionClientWithMeta } from '../safe-action';
import type { ActionResponse } from '../types';

const completeInvitationSchema = z.object({
  inviteCode: z.string(),
});

export const completeInvitation = actionClientWithMeta
  .metadata({
    name: 'complete-invitation',
    track: {
      event: 'complete_invitation',
      channel: 'organization',
    },
  })
  .inputSchema(completeInvitationSchema)
  .action(
    async (): Promise<
      ActionResponse<{
        accepted: boolean;
        organizationId: string;
      }>
    > => {
      throw new Error(
        'Legacy invitation codes are no longer supported. Ask your admin to send a new Clerk organization invitation.',
      );
    },
  );
