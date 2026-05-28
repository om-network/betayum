import { track } from '@/app/posthog';
import { getRequestOrganizationId } from '@/lib/request-organization';
import { resolveCurrentUserOrganizationContext } from '@/lib/permissions.server';
import { auth } from '@/utils/auth';
import { logger } from '@/utils/logger';
import { AuditLogEntityType, db } from '@db/server';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

interface ActionMetadata {
  name: string;
  track?: {
    description?: string;
    event: string;
    channel: string;
  };
}

interface AuthenticatedActionSession {
  session: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>['session'];
  user: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>['user'];
}

export interface ActionOrganizationContext {
  organizationId: string;
  memberId: string;
  permissions: Record<string, string[]>;
}

const auditEntityTypeByPrefix: Record<string, AuditLogEntityType> = {
  pol_: AuditLogEntityType.policy,
  ctl_: AuditLogEntityType.control,
  tsk_: AuditLogEntityType.task,
  vnd_: AuditLogEntityType.vendor,
  rsk_: AuditLogEntityType.risk,
  org_: AuditLogEntityType.organization,
  frm_: AuditLogEntityType.framework,
  req_: AuditLogEntityType.requirement,
  mem_: AuditLogEntityType.people,
  itr_: AuditLogEntityType.tests,
  int_: AuditLogEntityType.integration,
  frk_rq_: AuditLogEntityType.framework,
  frk_ctrl_: AuditLogEntityType.framework,
  frk_req_: AuditLogEntityType.framework,
};

export async function requireAuthenticatedActionSession(): Promise<AuthenticatedActionSession> {
  const response = await auth.api.getSession({
    headers: await headers(),
  });

  if (!response?.session || !response.user) {
    throw new Error('Unauthorized');
  }

  return {
    session: response.session,
    user: response.user,
  };
}

export async function resolveActionOrganizationContext(
  clientInput: unknown,
): Promise<ActionOrganizationContext> {
  const organizationId = getClientInputOrganizationId(clientInput)
    ?? await getRequestOrganizationId();

  if (!organizationId) {
    throw new Error('Organization not found');
  }

  const context = await resolveCurrentUserOrganizationContext(organizationId);
  if (!context) {
    throw new Error('Unauthorized');
  }

  const member = await db.member.findFirst({
    where: {
      organizationId: context.organizationId,
      userId: context.userId,
      deactivated: false,
    },
    select: { id: true },
  });

  if (!member) {
    throw new Error('Member not found');
  }

  return {
    organizationId: context.organizationId,
    memberId: member.id,
    permissions: context.permissions,
  };
}

export function redactFileData(input: unknown): unknown {
  if (!isRecord(input)) {
    return input;
  }

  const { fileData: _fileData, ...rest } = input;
  return rest;
}

export function getClientInputOrganizationId(input: unknown): string | null {
  if (!isRecord(input)) {
    return null;
  }

  const organizationId = input.organizationId;
  return typeof organizationId === 'string' && organizationId.length > 0
    ? organizationId
    : null;
}

export function getClientInputEntityId(input: unknown): string | null {
  if (!isRecord(input)) {
    return null;
  }

  const entityId = input.entityId;
  return typeof entityId === 'string' && entityId.length > 0 ? entityId : null;
}

export function logActionResult({
  clientInput,
  result,
}: {
  clientInput: unknown;
  result: { data?: unknown; validationErrors?: unknown };
}) {
  logger.info('Input ->', redactFileData(clientInput));
  logger.info('Result ->', result.data);

  if (result.validationErrors) {
    logger.warn('Validation Errors ->', result.validationErrors);
  }
}

export function trackAction({
  metadata,
  organizationId,
  user,
}: {
  metadata: ActionMetadata;
  organizationId?: string;
  user: AuthenticatedActionSession['user'];
}) {
  if (!metadata.track) {
    return;
  }

  track(user.id, metadata.track.event, {
    channel: metadata.track.channel,
    email: user.email,
    name: user.name,
    organizationId,
  });
}

export async function writeActionAuditLog({
  clientInput,
  metadata,
  organization,
  user,
}: {
  clientInput: unknown;
  metadata: ActionMetadata;
  organization: ActionOrganizationContext;
  user: AuthenticatedActionSession['user'];
}) {
  const headerStore = await headers();
  const entityId = getClientInputEntityId(clientInput);

  const data = {
    userId: user.id,
    email: user.email,
    name: user.name,
    organizationId: organization.organizationId,
    action: metadata.name,
    input: redactFileData(clientInput),
    ipAddress: headerStore.get('x-forwarded-for') || null,
    userAgent: headerStore.get('user-agent') || null,
  };

  try {
    await db.auditLog.create({
      data: {
        data: JSON.stringify(data),
        memberId: organization.memberId,
        userId: user.id,
        description: metadata.track?.description || null,
        organizationId: organization.organizationId,
        entityId,
        entityType: resolveAuditEntityType(entityId),
      },
    });
  } catch (error) {
    logger.error('Audit log error:', error);
  }
}

export async function revalidateCurrentPath() {
  const headerStore = await headers();
  const rawPath = headerStore.get('x-pathname') || headerStore.get('referer') || '';
  const path = rawPath.replace(/\/[a-z]{2}\//, '/');
  revalidatePath(path);
}

function resolveAuditEntityType(entityId: string | null): AuditLogEntityType | null {
  if (!entityId) {
    return null;
  }

  const parts = entityId.split('_');
  const prefix = `${parts[0]}_`;

  if (parts.length > 2) {
    const complexPrefix = `${prefix}${parts[1]}_`;
    return auditEntityTypeByPrefix[complexPrefix] ?? auditEntityTypeByPrefix[prefix] ?? null;
  }

  return auditEntityTypeByPrefix[prefix] ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
