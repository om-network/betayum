'use server';

import { maskEmailForLogs } from '@/lib/mask-email';
import { auth } from '@/utils/auth';
import type { Role } from '@db';
import { headers } from 'next/headers';

export const inviteNewMember = async ({
  email,
  organizationId,
  roles,
}: {
  email: string;
  organizationId: string;
  roles: Role[];
}) => {
  const requestId = crypto.randomUUID();
  const safeEmail = maskEmailForLogs(email);
  const roleString = roles.join(',');
  const startTime = Date.now();

  console.info('[inviteNewMember] start', {
    requestId,
    organizationId,
    invitedEmail: safeEmail,
    roles: roleString,
  });

  try {
    const inviteResult = await auth.api.createInvitation({
      headers: await headers(),
      body: {
        email: email.toLowerCase(),
        role: roleString,
        organizationId,
      },
    });

    console.info('[inviteNewMember] success', {
      requestId,
      organizationId,
      invitedEmail: safeEmail,
      roles: roleString,
      durationMs: Date.now() - startTime,
      resultKeys: inviteResult && typeof inviteResult === 'object' ? Object.keys(inviteResult) : [],
    });

    return { success: true };
  } catch (error) {
    console.error('[inviteNewMember] failure', {
      requestId,
      organizationId,
      invitedEmail: safeEmail,
      roles: roleString,
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};
