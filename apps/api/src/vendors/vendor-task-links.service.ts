import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { db } from '@db';

interface ApplyVendorTaskLinksParams {
  vendorId: string;
  organizationId: string;
  taskIds: string[];
  replace?: boolean;
}

interface UnlinkVendorTaskParams {
  vendorId: string;
  taskId: string;
  organizationId: string;
}

@Injectable()
export class VendorTaskLinksService {
  async applyTaskLinks({
    vendorId,
    organizationId,
    taskIds,
    replace = false,
  }: ApplyVendorTaskLinksParams): Promise<{ linked: number }> {
    const vendor = await db.vendor.findFirst({
      where: { id: vendorId, organizationId },
      select: { id: true },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
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

    await db.vendor.update({
      where: { id: vendorId },
      data: {
        ...taskRelation,
        autoLinkRunId: null,
        autoLinkRunStartedAt: null,
      },
    });

    return { linked: uniqueTaskIds.length };
  }

  async unlinkTask({
    vendorId,
    taskId,
    organizationId,
  }: UnlinkVendorTaskParams): Promise<{ ok: true }> {
    const vendor = await db.vendor.findFirst({
      where: { id: vendorId, organizationId },
      select: {
        id: true,
        tasks: { where: { id: taskId }, select: { id: true } },
      },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    if (vendor.tasks.length === 0) {
      throw new NotFoundException('Task is not linked to this vendor');
    }

    await db.vendor.update({
      where: { id: vendorId },
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
