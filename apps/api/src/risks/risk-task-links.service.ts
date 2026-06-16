import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { db } from '@db';

interface ApplyRiskTaskLinksParams {
  riskId: string;
  organizationId: string;
  taskIds: string[];
  replace?: boolean;
}

interface UnlinkRiskTaskParams {
  riskId: string;
  taskId: string;
  organizationId: string;
}

@Injectable()
export class RiskTaskLinksService {
  async applyTaskLinks({
    riskId,
    organizationId,
    taskIds,
    replace = false,
  }: ApplyRiskTaskLinksParams): Promise<{ linked: number }> {
    const risk = await db.risk.findFirst({
      where: { id: riskId, organizationId },
      select: { id: true },
    });

    if (!risk) {
      throw new NotFoundException('Risk not found');
    }

    const uniqueTaskIds = Array.from(new Set(taskIds));
    await this.validateTaskOwnership({
      organizationId,
      taskIds: uniqueTaskIds,
    });

    const taskRefs = uniqueTaskIds.map((id) => ({ id }));
    const taskRelation = replace
      ? { tasks: { set: taskRefs } }
      : uniqueTaskIds.length > 0
        ? { tasks: { connect: taskRefs } }
        : {};

    await db.risk.update({
      where: { id: riskId },
      data: {
        ...taskRelation,
        autoLinkRunId: null,
        autoLinkRunStartedAt: null,
      },
    });

    return { linked: uniqueTaskIds.length };
  }

  async unlinkTask({
    riskId,
    taskId,
    organizationId,
  }: UnlinkRiskTaskParams): Promise<{ ok: true }> {
    const risk = await db.risk.findFirst({
      where: { id: riskId, organizationId },
      select: {
        id: true,
        tasks: { where: { id: taskId }, select: { id: true } },
      },
    });

    if (!risk) {
      throw new NotFoundException('Risk not found');
    }

    if (risk.tasks.length === 0) {
      throw new NotFoundException('Task is not linked to this risk');
    }

    await db.risk.update({
      where: { id: riskId },
      data: { tasks: { disconnect: { id: taskId } } },
    });

    return { ok: true };
  }

  private async validateTaskOwnership({
    organizationId,
    taskIds,
  }: {
    organizationId: string;
    taskIds: string[];
  }): Promise<void> {
    if (taskIds.length === 0) {
      return;
    }

    const ownedTasks = await db.task.findMany({
      where: { id: { in: taskIds }, organizationId },
      select: { id: true },
    });

    if (ownedTasks.length !== new Set(taskIds).size) {
      throw new BadRequestException(
        'One or more tasks do not belong to this organization',
      );
    }
  }
}
