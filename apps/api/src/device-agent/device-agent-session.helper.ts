import { db } from '@db';
import { randomBytes } from 'node:crypto';

/** One year in milliseconds. */
export const DEVICE_AGENT_SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;

export interface CreatedDeviceAgentSession {
  sessionId: string;
  token: string;
  expiresAt: Date;
}

export async function createDeviceAgentSession({
  userId,
}: {
  userId: string;
}): Promise<CreatedDeviceAgentSession> {
  const expiresAt = new Date(Date.now() + DEVICE_AGENT_SESSION_TTL_MS);
  const token = randomBytes(48).toString('hex');
  const activeOrganization = await db.member.findFirst({
    where: {
      userId,
      deactivated: false,
    },
    orderBy: { createdAt: 'desc' },
    select: { organizationId: true },
  });

  const session = await db.session.create({
    data: {
      userId,
      token,
      expiresAt,
      deviceAgent: true,
      activeOrganizationId: activeOrganization?.organizationId,
    },
  });

  return {
    sessionId: session.id,
    token: session.token,
    expiresAt: session.expiresAt,
  };
}
