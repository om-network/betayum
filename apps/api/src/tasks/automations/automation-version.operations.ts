import { db } from '@db';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { AutomationAuditService } from './automation-audit.service';
import type {
  AutomationActor,
  ScopedAutomationParams,
} from './automation-types';
import type { AutomationUsageLimitsService } from './automation-usage-limits.service';

export async function createAutomationVersion({
  organizationId,
  taskId,
  automationId,
  data,
  actor,
  auditService,
  usageLimitsService,
}: ScopedAutomationParams & {
  data: { scriptKey: string; changelog?: string };
  actor?: AutomationActor;
  auditService: AutomationAuditService;
  usageLimitsService: AutomationUsageLimitsService;
}) {
  const automation = await findScopedAutomation({
    organizationId,
    taskId,
    automationId,
  });
  await usageLimitsService.assertVersionLimit({
    organizationId,
    taskId,
    automationId,
  });
  const latestVersion = await db.evidenceAutomationVersion.findFirst({
    where: {
      evidenceAutomationId: automationId,
      evidenceAutomation: {
        taskId,
        task: { organizationId },
      },
    },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const nextVersion = (latestVersion?.version ?? 0) + 1;

  const [version] = await db.$transaction([
    db.evidenceAutomationVersion.create({
      data: {
        evidenceAutomationId: automationId,
        version: nextVersion,
        scriptKey: data.scriptKey,
        scriptContent: automation.scriptDraft ?? null,
        changelog: data.changelog,
      },
    }),
    db.evidenceAutomation.update({
      where: { id: automationId },
      data: { isEnabled: true },
    }),
  ]);

  if (actor) {
    await auditService.logAutomationEvent({
      actor,
      organizationId,
      taskId,
      automationId,
      action: 'published',
      description: `published automation v${version.version}`,
      version: version.version,
    });
  }

  return { success: true, version };
}

export async function restoreAutomationVersion({
  organizationId,
  taskId,
  automationId,
  version,
}: ScopedAutomationParams & { version: number; actor?: AutomationActor }) {
  await findScopedAutomation({ organizationId, taskId, automationId });

  const versionRecord = await db.evidenceAutomationVersion.findFirst({
    where: {
      evidenceAutomationId: automationId,
      version,
      evidenceAutomation: {
        taskId,
        task: { organizationId },
      },
    },
  });

  if (!versionRecord) {
    throw new NotFoundException('Automation version not found');
  }

  throw new ServiceUnavailableException(
    'Automation draft storage is not configured',
  );
}

export async function listAutomationVersions({
  organizationId,
  taskId,
  automationId,
  limit,
  offset,
}: ScopedAutomationParams & { limit?: number; offset?: number }) {
  const versions = await db.evidenceAutomationVersion.findMany({
    where: {
      evidenceAutomationId: automationId,
      evidenceAutomation: {
        taskId,
        task: { organizationId },
      },
    },
    orderBy: {
      version: 'desc',
    },
    ...(limit ? { take: limit } : {}),
    ...(offset ? { skip: offset } : {}),
  });

  return {
    success: true,
    versions,
  };
}

async function findScopedAutomation({
  organizationId,
  taskId,
  automationId,
}: ScopedAutomationParams) {
  const automation = await db.evidenceAutomation.findFirst({
    where: {
      id: automationId,
      taskId,
      task: { organizationId },
    },
  });

  if (!automation) {
    throw new NotFoundException('Automation not found');
  }

  return automation;
}
