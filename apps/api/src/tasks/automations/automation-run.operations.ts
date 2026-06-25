import { db } from '@db';
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AutomationAuditService } from './automation-audit.service';
import type { AutomationRuntimeService } from './automation-runtime.service';
import type { AutomationSecretsService } from './automation-secrets.service';
import type {
  AutomationActor,
  AutomationSecretRef,
  ScopedAutomationParams,
} from './automation-types';
import type { AutomationUsageLimitsService } from './automation-usage-limits.service';
import type { AutomationWorkerDispatcherService } from './automation-worker-dispatcher.service';

export async function startManualAutomationRun({
  organizationId,
  taskId,
  automationId,
  version,
  secretRefs = [],
  actor,
  auditService,
  runtimeService,
  secretsService,
  usageLimitsService,
  workerDispatcher,
}: ScopedAutomationParams & {
  version: number;
  secretRefs?: AutomationSecretRef[];
  actor?: AutomationActor;
  auditService: AutomationAuditService;
  runtimeService: AutomationRuntimeService;
  secretsService: AutomationSecretsService;
  usageLimitsService: AutomationUsageLimitsService;
  workerDispatcher: AutomationWorkerDispatcherService;
}) {
  if (!Number.isInteger(version) || version <= 0) {
    throw new BadRequestException('Automation version is required');
  }

  runtimeService.assertExecutionAvailable();
  await findScopedAutomation({ organizationId, taskId, automationId });
  await usageLimitsService.assertManualRunLimit({ organizationId });
  await secretsService.verifySecretRefs({ organizationId, secretRefs });

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

  const run = await db.evidenceAutomationRun.create({
    data: {
      evidenceAutomationId: automationId,
      taskId,
      triggeredBy: 'manual',
      status: 'pending',
      version,
    },
  });

  const workerRequest = runtimeService.buildExecutionRequest({
    organizationId,
    taskId,
    automationId,
    runId: run.id,
    version,
    artifactKey: versionRecord.scriptKey,
    trigger: 'manual',
    secretRefs,
    tools: [],
  });

  try {
    await workerDispatcher.enqueue(workerRequest);
  } catch (error) {
    await db.evidenceAutomationRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Worker enqueue failed',
        completedAt: new Date(),
      },
    });
    throw error instanceof ServiceUnavailableException
      ? error
      : new ServiceUnavailableException(
          'Task automation worker enqueue failed',
        );
  }

  if (actor) {
    await auditService.logAutomationEvent({
      actor,
      organizationId,
      taskId,
      automationId,
      action: 'manual_run_started',
      description: `started automation run v${version}`,
      runId: run.id,
      version,
    });
  }

  if (actor && secretRefs.length > 0) {
    await auditService.logAutomationEvent({
      actor,
      organizationId,
      taskId,
      automationId,
      action: 'secret_refs_used',
      description: 'used automation secret references',
      runId: run.id,
      version,
      secretRefs,
    });
  }

  return { success: true, run, workerRequest };
}

export async function findAutomationRunsByAutomationId({
  organizationId,
  taskId,
  automationId,
}: ScopedAutomationParams) {
  return db.evidenceAutomationRun.findMany({
    where: {
      evidenceAutomationId: automationId,
      evidenceAutomation: {
        taskId,
        task: { organizationId },
      },
    },
    include: {
      evidenceAutomation: {
        select: { name: true },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

export async function findAutomationRunById({
  organizationId,
  taskId,
  runId,
}: {
  organizationId: string;
  taskId: string;
  runId: string;
}) {
  const run = await db.evidenceAutomationRun.findFirst({
    where: {
      id: runId,
      taskId,
      evidenceAutomation: {
        task: { organizationId },
      },
    },
  });

  if (!run) {
    throw new NotFoundException('Automation run not found');
  }

  return { success: true, run };
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
