import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '@db';
import { AutomationAuditService } from './automation-audit.service';
import { AutomationSecretsService } from './automation-secrets.service';
import type {
  AutomationActor,
  AutomationSecretRef,
  ScopedAutomationParams,
  TaskAutomationScope,
} from './automation-types';
import { AutomationUsageLimitsService } from './automation-usage-limits.service';
import { AutomationRuntimeService } from './automation-runtime.service';
import { UpdateAutomationDto } from './dto/update-automation.dto';

@Injectable()
export class AutomationsService {
  constructor(
    private readonly automationRuntimeService: AutomationRuntimeService,
    private readonly automationUsageLimitsService: AutomationUsageLimitsService,
    private readonly automationSecretsService: AutomationSecretsService,
    private readonly automationAuditService: AutomationAuditService,
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

    const { scheduleFrequency, ...rest } = data;
    const automation = await db.evidenceAutomation.update({
      where: {
        id: automationId,
      },
      data: {
        ...rest,
        ...(scheduleFrequency !== undefined ? { scheduleFrequency } : {}),
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

  async createVersion({
    organizationId,
    taskId,
    automationId,
    data,
    actor,
  }: ScopedAutomationParams & {
    data: { scriptKey: string; changelog?: string };
    actor?: AutomationActor;
  }) {
    await this.findById({ organizationId, taskId, automationId });
    await this.automationUsageLimitsService.assertVersionLimit({
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
          changelog: data.changelog,
        },
      }),
      db.evidenceAutomation.update({
        where: { id: automationId },
        data: { isEnabled: true },
      }),
    ]);
    await this.logIfActor({
      actor,
      organizationId,
      taskId,
      automationId,
      action: 'published',
      description: `published automation v${version.version}`,
      version: version.version,
    });
    return { success: true, version };
  }

  async restoreVersion({
    organizationId,
    taskId,
    automationId,
    version,
    actor,
  }: ScopedAutomationParams & { version: number; actor?: AutomationActor }) {
    await this.findById({ organizationId, taskId, automationId });

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

    await this.logIfActor({
      actor,
      organizationId,
      taskId,
      automationId,
      action: 'restored',
      description: `restored automation v${versionRecord.version}`,
      version: versionRecord.version,
    });

    return {
      success: true,
      draft: {
        automationId,
        restoredFromVersion: versionRecord.version,
        scriptKey: versionRecord.scriptKey,
      },
    };
  }

  async getChatHistory({
    organizationId,
    taskId,
    automationId,
    offset = 0,
    limit = 50,
  }: ScopedAutomationParams & { offset?: number; limit?: number }) {
    const { automation } = await this.findById({
      organizationId,
      taskId,
      automationId,
    });
    const messages = this.parseChatHistory(automation.chatHistory);
    const pagedMessages = messages.slice(offset, offset + limit);

    return {
      success: true,
      data: {
        messages: pagedMessages,
        total: messages.length,
        hasMore: offset + limit < messages.length,
      },
    };
  }

  async saveChatHistory({
    organizationId,
    taskId,
    automationId,
    messages,
    actor,
  }: ScopedAutomationParams & {
    messages: unknown[];
    actor?: AutomationActor;
  }) {
    await this.findById({ organizationId, taskId, automationId });
    await db.evidenceAutomation.update({
      where: { id: automationId },
      data: { chatHistory: JSON.stringify(messages) },
    });
    await this.logIfActor({
      actor,
      organizationId,
      taskId,
      automationId,
      action: 'draft_updated',
      description: 'updated automation chat draft',
    });

    return { success: true };
  }

  async startManualRun({
    organizationId,
    taskId,
    automationId,
    version,
    secretRefs = [],
    actor,
  }: ScopedAutomationParams & {
    version: number;
    secretRefs?: AutomationSecretRef[];
    actor?: AutomationActor;
  }) {
    this.automationRuntimeService.assertExecutionAvailable();
    await this.findById({ organizationId, taskId, automationId });
    await this.automationUsageLimitsService.assertManualRunLimit({
      organizationId,
    });
    await this.automationSecretsService.verifySecretRefs({
      organizationId,
      secretRefs,
    });

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

    const workerRequest = this.automationRuntimeService.buildExecutionRequest({
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

    await this.logIfActor({
      actor,
      organizationId,
      taskId,
      automationId,
      action: 'manual_run_started',
      description: `started automation run v${version}`,
      runId: run.id,
      version,
    });
    if (secretRefs.length > 0) {
      await this.logIfActor({
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

  private parseChatHistory(chatHistory: string | null): unknown[] {
    if (!chatHistory) {
      return [];
    }

    try {
      const parsed: unknown = JSON.parse(chatHistory);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async findRunsByAutomationId({
    organizationId,
    taskId,
    automationId,
  }: ScopedAutomationParams) {
    const runs = await db.evidenceAutomationRun.findMany({
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

    return runs;
  }

  async listVersions({
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
}
