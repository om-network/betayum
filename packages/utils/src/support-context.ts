import { createHmac, timingSafeEqual } from 'node:crypto';

export const SUPPORT_CONTEXT_COOKIE = 'comp_support_context';
const SUPPORT_CONTEXT_VERSION = 1;

export type SupportContextPayload = {
  version: number;
  actorUserId: string;
  organizationId: string;
  organizationName: string;
  targetUserId: string;
  targetUserName: string;
  targetUserEmail: string;
  reason?: string;
  context?: string;
  expiresAt: number;
};

type SignSupportContextParams = {
  payload: SupportContextPayload;
  secret: string;
};

type ParseSupportContextParams = {
  cookieValue: string;
  secret: string;
  now?: number;
};

export function createSupportContextPayload(input: {
  actorUserId: string;
  organizationId: string;
  organizationName: string;
  targetUserId: string;
  targetUserName: string;
  targetUserEmail: string;
  reason?: string;
  context?: string;
  expiresAt: number;
}): SupportContextPayload {
  return {
    version: SUPPORT_CONTEXT_VERSION,
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    organizationName: input.organizationName,
    targetUserId: input.targetUserId,
    targetUserName: input.targetUserName,
    targetUserEmail: input.targetUserEmail.toLowerCase(),
    reason: input.reason,
    context: input.context,
    expiresAt: input.expiresAt,
  };
}

export function signSupportContext({ payload, secret }: SignSupportContextParams): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = signValue({ encodedPayload, secret });

  return `${encodedPayload}.${signature}`;
}

export function parseSupportContext({
  cookieValue,
  secret,
  now = Date.now(),
}: ParseSupportContextParams): SupportContextPayload {
  const [encodedPayload, encodedSignature] = cookieValue.split('.');
  if (!encodedPayload || !encodedSignature) {
    throw new Error('Invalid support context cookie format.');
  }

  const expectedSignature = signValue({ encodedPayload, secret });
  const actualSignature = Buffer.from(encodedSignature, 'base64url');

  if (
    actualSignature.length !== expectedSignature.length ||
    !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    throw new Error('Invalid support context cookie signature.');
  }

  const rawPayload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
  const parsed = JSON.parse(rawPayload) as Partial<SupportContextPayload>;

  if (
    parsed.version !== SUPPORT_CONTEXT_VERSION ||
    typeof parsed.actorUserId !== 'string' ||
    typeof parsed.organizationId !== 'string' ||
    typeof parsed.organizationName !== 'string' ||
    typeof parsed.targetUserId !== 'string' ||
    typeof parsed.targetUserName !== 'string' ||
    typeof parsed.targetUserEmail !== 'string' ||
    typeof parsed.expiresAt !== 'number'
  ) {
    throw new Error('Invalid support context payload.');
  }

  if (parsed.expiresAt <= now) {
    throw new Error('Support context has expired.');
  }

  return {
    version: parsed.version,
    actorUserId: parsed.actorUserId,
    organizationId: parsed.organizationId,
    organizationName: parsed.organizationName,
    targetUserId: parsed.targetUserId,
    targetUserName: parsed.targetUserName,
    targetUserEmail: parsed.targetUserEmail,
    reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
    context: typeof parsed.context === 'string' ? parsed.context : undefined,
    expiresAt: parsed.expiresAt,
  };
}

function signValue({ encodedPayload, secret }: { encodedPayload: string; secret: string }): Buffer {
  return createHmac('sha256', secret).update(encodedPayload).digest();
}
