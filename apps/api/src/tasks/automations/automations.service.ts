import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { db } from '@db';
import { AutomationAuditService } from './automation-audit.service';
import {
  getAutomationChatHistory,
  saveAutomationChatHistory,
} from './automation-chat-history.operations';
import {
  findAutomationRunById,
  findAutomationRunsByAutomationId,
  startManualAutomationRun,
} from './automation-run.operations';
import { AutomationRuntimeService } from './automation-runtime.service';
import { AutomationSecretsService } from './automation-secrets.service';
import type {
  AutomationActor,
  AutomationSecretRef,
  ScopedAutomationParams,
  TaskAutomationScope,
} from './automation-types';
import { AutomationUsageLimitsService } from './automation-usage-limits.service';
import {
  createAutomationVersion,
  listAutomationVersions,
  restoreAutomationVersion,
} from './automation-version.operations';
import { AutomationWorkerDispatcherService } from './automation-worker-dispatcher.service';
import { UpdateAutomationDto } from './dto/update-automation.dto';

@Injectable()
export class AutomationsService {
  constructor(
    private readonly automationRuntimeService: AutomationRuntimeService,
    private readonly automationUsageLimitsService: AutomationUsageLimitsService,
    private readonly automationSecretsService: AutomationSecretsService,
    private readonly automationAuditService: AutomationAuditService,
    private readonly automationWorkerDispatcher: AutomationWorkerDispatcherService,
  ) {}

  async findByTaskId({ organizationId, taskId }: TaskAutomationScope) {
    const automations = await db.evidenceAutomation.findMany({
      where: {
        taskId,
        task: { organizationId },
      },
      include: {
        runs: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return {
      success: true,
      automations,
    };
  }

  async findById({
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

    return {
      success: true,
      automation,
    };
  }

  async create({
    organizationId,
    taskId,
    actor,
  }: TaskAutomationScope & { actor?: AutomationActor }) {
    const task = await db.task.findFirst({
      where: {
        id: taskId,
        organizationId,
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const automation = await db.evidenceAutomation.create({
      data: {
        name: `${task.title} - Evidence Collection`,
        taskId,
      },
    });

    await this.logIfActor({
      actor,
      organizationId,
      taskId,
      automationId: automation.id,
      action: 'created',
      description: 'created automation',
    });

    return {
      success: true,
      automation: {
        id: automation.id,
        name: automation.name,
      },
    };
  }

  async update({
    organizationId,
    taskId,
    automationId,
    data,
    actor,
  }: ScopedAutomationParams & {
    data: UpdateAutomationDto;
    actor?: AutomationActor;
  }) {
    await this.findById({ organizationId, taskId, automationId });

    const { scheduleFrequency, allowedTools, ...rest } = data;
    const automation = await db.evidenceAutomation.update({
      where: {
        id: automationId,
      },
      data: {
        ...rest,
        ...(data.setupStatus !== undefined
          ? { setupStatusUpdatedAt: new Date() }
          : {}),
        ...(scheduleFrequency !== undefined ? { scheduleFrequency } : {}),
        ...(allowedTools !== undefined ? { allowedTools } : {}),
      },
    });

    const statusAction =
      data.isEnabled === undefined
        ? null
        : data.isEnabled
          ? 'enabled'
          : 'disabled';
    await this.logIfActor({
      actor,
      organizationId,
      taskId,
      automationId,
      action: statusAction ?? 'draft_updated',
      description: statusAction
        ? `${statusAction} automation`
        : 'updated automation draft',
    });

    return {
      success: true,
      automation: {
        id: automation.id,
        name: automation.name,
        description: automation.description,
      },
    };
  }

  async delete({
    organizationId,
    taskId,
    automationId,
    actor,
  }: ScopedAutomationParams & { actor?: AutomationActor }) {
    await this.findById({ organizationId, taskId, automationId });

    await db.evidenceAutomation.delete({
      where: {
        id: automationId,
      },
    });

    await this.logIfActor({
      actor,
      organizationId,
      taskId,
      automationId,
      action: 'disabled',
      description: 'deleted automation',
    });

    return {
      success: true,
      message: 'Automation deleted successfully',
    };
  }

  createVersion(
    params: ScopedAutomationParams & {
      data: { scriptKey: string; changelog?: string };
      actor?: AutomationActor;
    },
  ) {
    return createAutomationVersion({
      ...params,
      auditService: this.automationAuditService,
      usageLimitsService: this.automationUsageLimitsService,
    });
  }
  restoreVersion(
    params: ScopedAutomationParams & {
      version: number;
      actor?: AutomationActor;
    },
  ) {
    return restoreAutomationVersion(params);
  }
  getChatHistory(
    params: ScopedAutomationParams & { offset?: number; limit?: number },
  ) {
    return getAutomationChatHistory(params);
  }

  saveChatHistory(
    params: ScopedAutomationParams & {
      messages: unknown[];
      actor?: AutomationActor;
    },
  ) {
    return saveAutomationChatHistory({
      ...params,
      auditService: this.automationAuditService,
    });
  }

  startManualRun(
    params: ScopedAutomationParams & {
      version: number;
      secretRefs?: AutomationSecretRef[];
      actor?: AutomationActor;
    },
  ) {
    return startManualAutomationRun({
      ...params,
      auditService: this.automationAuditService,
      runtimeService: this.automationRuntimeService,
      secretsService: this.automationSecretsService,
      usageLimitsService: this.automationUsageLimitsService,
      workerDispatcher: this.automationWorkerDispatcher,
    });
  }

  findRunsByAutomationId(params: ScopedAutomationParams) {
    return findAutomationRunsByAutomationId(params);
  }

  findRunById(params: {
    organizationId: string;
    taskId: string;
    runId: string;
  }) {
    return findAutomationRunById(params);
  }

  listVersions(
    params: ScopedAutomationParams & { limit?: number; offset?: number },
  ) {
    return listAutomationVersions(params);
  }

  async getDraftScript({
    organizationId,
    taskId,
    automationId,
  }: ScopedAutomationParams) {
    const automation = await db.evidenceAutomation.findFirst({
      where: { id: automationId, taskId, task: { organizationId } },
      select: { scriptDraft: true },
    });
    if (!automation) {
      return { success: true, content: null };
    }
    return { success: true, content: automation.scriptDraft ?? null };
  }

  async saveDraftScript({
    organizationId,
    taskId,
    automationId,
    content,
  }: ScopedAutomationParams & { content: string }) {
    await this.findById({ organizationId, taskId, automationId });
    await db.evidenceAutomation.update({
      where: { id: automationId },
      data: { scriptDraft: content },
    });
    return { success: true };
  }

  async runDraftScript({
    organizationId,
    taskId,
    automationId,
    secretRefs = [],
    actor,
  }: ScopedAutomationParams & {
    secretRefs?: AutomationSecretRef[];
    actor?: AutomationActor;
  }) {
    this.automationRuntimeService.assertExecutionAvailable();

    const automation = await db.evidenceAutomation.findFirst({
      where: { id: automationId, taskId, task: { organizationId } },
      select: { scriptDraft: true },
    });

    if (!automation) {
      throw new NotFoundException('Automation not found');
    }

    if (!automation.scriptDraft) {
      throw new BadRequestException('No draft script to run');
    }

    await this.automationUsageLimitsService.assertManualRunLimit({
      organizationId,
    });

    if (secretRefs.length > 0) {
      await this.automationSecretsService.verifySecretRefs({
        organizationId,
        secretRefs,
      });
    }

    const run = await db.evidenceAutomationRun.create({
      data: {
        evidenceAutomationId: automationId,
        taskId,
        triggeredBy: 'manual',
        status: 'pending',
        version: null,
      },
    });

    const artifactKey = `first-party://${organizationId}/${taskId}/${automationId}/draft`;

    const workerRequest = this.automationRuntimeService.buildExecutionRequest({
      organizationId,
      taskId,
      automationId,
      runId: run.id,
      version: 0,
      artifactKey,
      trigger: 'test',
      secretRefs,
      tools: [],
    });

    try {
      await this.automationWorkerDispatcher.enqueue(workerRequest);
    } catch (error) {
      await db.evidenceAutomationRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          error:
            error instanceof Error ? error.message : 'Worker enqueue failed',
          completedAt: new Date(),
        },
      });
      throw error;
    }

    await this.logIfActor({
      actor,
      organizationId,
      taskId,
      automationId,
      action: 'manual_run_started',
      description: 'started draft script test run',
      runId: run.id,
    });

    return { success: true, run };
  }

  private async logIfActor({
    actor,
    ...params
  }: Omit<
    Parameters<AutomationAuditService['logAutomationEvent']>[0],
    'actor'
  > & {
    actor?: AutomationActor;
  }) {
    if (!actor) {
      return;
    }

    await this.automationAuditService.logAutomationEvent({
      ...params,
      actor,
    });
  }
}
