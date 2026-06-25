import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '@db';
import { AutomationRuntimeService } from './automation-runtime.service';
import { UpdateAutomationDto } from './dto/update-automation.dto';

interface TaskAutomationScope {
  organizationId: string;
  taskId: string;
}

interface ScopedAutomationParams extends TaskAutomationScope {
  automationId: string;
}

@Injectable()
export class AutomationsService {
  constructor(private readonly automationRuntimeService: AutomationRuntimeService) {}

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

  async create({ organizationId, taskId }: TaskAutomationScope) {
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
  }: ScopedAutomationParams & { data: UpdateAutomationDto }) {
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
  }: ScopedAutomationParams) {
    await this.findById({ organizationId, taskId, automationId });

    await db.evidenceAutomation.delete({
      where: {
        id: automationId,
      },
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
  }: ScopedAutomationParams & {
    data: { scriptKey: string; changelog?: string };
  }) {
    await this.findById({ organizationId, taskId, automationId });
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
    return { success: true, version };
  }

  async restoreVersion({
    organizationId,
    taskId,
    automationId,
    version,
  }: ScopedAutomationParams & { version: number }) {
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

    return {
      success: true,
      draft: {
        automationId,
        restoredFromVersion: versionRecord.version,
        scriptKey: versionRecord.scriptKey,
      },
    };
  }

  async startManualRun({
    organizationId,
    taskId,
    automationId,
    version,
  }: ScopedAutomationParams & { version: number }) {
    this.automationRuntimeService.assertExecutionAvailable();
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
      secretRefs: [],
      tools: [],
    });

    return { success: true, run, workerRequest };
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
