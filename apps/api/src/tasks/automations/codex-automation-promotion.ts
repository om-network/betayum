import {
  AttachmentEntityType,
  AttachmentType,
  CodexAutomationRunStatus,
  db,
} from '@db';
import { randomBytes } from 'node:crypto';
import { objectStorage } from '../../app/object-storage';
import { reconcileCodexAutomation } from './codex-automation-reconciliation';

export async function promoteCodexAutomationScreenshots({
  organizationId,
  runId,
}: {
  organizationId: string;
  runId: string;
}) {
  const run = await db.codexAutomationRun.findFirst({
    where: { id: runId, organizationId },
    include: { screenshots: true },
  });
  if (!run || !run.completedAt) {
    throw new Error('Completed Codex automation run not found');
  }

  await db.codexAutomationRun.update({
    where: { id: run.id },
    data: { status: CodexAutomationRunStatus.promoting },
  });

  for (const screenshot of run.screenshots) {
    if (screenshot.attachmentId) continue;
    const safeName = screenshot.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const finalObjectKey =
      screenshot.finalObjectKey ??
      `${organizationId}/attachments/task/${run.taskId}/${Date.now()}-${randomBytes(12).toString('hex')}-${safeName}`;
    await objectStorage.copyObject({
      organizationId,
      sourceKey: screenshot.stagedObjectKey,
      destinationKey: finalObjectKey,
    });
    const attachment = await db.$transaction(async (tx) => {
      const latest = await tx.codexAutomationScreenshot.findUniqueOrThrow({
        where: { id: screenshot.id },
      });
      if (latest.attachmentId) {
        return tx.attachment.findUniqueOrThrow({
          where: { id: latest.attachmentId },
        });
      }
      const created = await tx.attachment.create({
        data: {
          entityId: run.taskId,
          entityType: AttachmentEntityType.task,
          name: screenshot.fileName,
          organizationId,
          type: AttachmentType.image,
          url: finalObjectKey,
        },
      });
      await tx.codexAutomationScreenshot.update({
        where: { id: screenshot.id },
        data: { attachmentId: created.id, finalObjectKey },
      });
      return created;
    });
    if (attachment.url === finalObjectKey) {
      await objectStorage.deleteObject({
        organizationId,
        key: screenshot.stagedObjectKey,
      });
    }
  }

  const promoted = await db.codexAutomationRun.update({
    where: { id: run.id },
    data: {
      promotedAt: new Date(),
      status: CodexAutomationRunStatus.promoted,
    },
    include: { screenshots: true },
  });
  const attachmentIds = promoted.screenshots.flatMap((item) =>
    item.attachmentId ? [item.attachmentId] : [],
  );
  const summary = promoted.summary ?? '';
  await reconcileCodexAutomation({
    automationId: promoted.automationId,
    message:
      attachmentIds.length > 0
        ? `Codex evidence collection completed and attached ${attachmentIds.length} final screenshot${attachmentIds.length === 1 ? '' : 's'}.\n\n${summary}`
        : `Codex completed without attaching screenshot evidence.\n\n${summary}`,
    runId: promoted.id,
    successful: attachmentIds.length > 0,
  });
  return {
    attachmentIds,
    screenshots: promoted.screenshots.map((item) => ({
      attachmentId: item.attachmentId,
      fileName: item.fileName,
      mimeType: item.mimeType,
    })),
    summary,
  };
}
