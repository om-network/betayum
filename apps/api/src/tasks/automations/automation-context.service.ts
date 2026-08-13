import {
  objectStorage,
  readObjectStreamToBuffer,
} from '../../app/object-storage';
import { extractContentFromFile } from '../../questionnaire/utils/content-extractor';
import { AttachmentEntityType, db, FindingStatus } from '@db';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_EXTRACTED_CHARS = 100_000;

function inferMimeType(name: string, storedType: string): string {
  const extension = name.split('.').pop()?.toLowerCase();
  const byExtension: Record<string, string> = {
    csv: 'text/csv',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    md: 'text/markdown',
    pdf: 'application/pdf',
    png: 'image/png',
    txt: 'text/plain',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return (extension && byExtension[extension]) || storedType;
}

@Injectable()
export class AutomationContextService {
  async getContext({
    organizationId,
    taskId,
  }: {
    organizationId: string;
    taskId: string;
  }) {
    const [task, attachments, browserVm] = await Promise.all([
      db.task.findFirst({
        where: { id: taskId, organizationId, archivedAt: null },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          department: true,
          frequency: true,
          reviewDate: true,
          lastCompletedAt: true,
          assignee: { select: { id: true, user: { select: { name: true } } } },
          approver: { select: { id: true, user: { select: { name: true } } } },
          organization: { select: { name: true, website: true } },
          controls: {
            where: { archivedAt: null },
            select: {
              id: true,
              name: true,
              description: true,
              policies: {
                where: { archivedAt: null, isArchived: false },
                select: { id: true, name: true, status: true },
              },
              requirementsMapped: {
                where: { archivedAt: null },
                select: {
                  requirement: {
                    select: { identifier: true, name: true, description: true },
                  },
                  customRequirement: {
                    select: { identifier: true, name: true, description: true },
                  },
                  frameworkInstance: {
                    select: {
                      framework: { select: { name: true } },
                      customFramework: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
          vendors: { select: { id: true, name: true, status: true } },
          risks: { select: { id: true, title: true, status: true } },
          findings: {
            where: { status: { not: FindingStatus.closed } },
            select: {
              id: true,
              status: true,
              severity: true,
              content: true,
              revisionNote: true,
              updatedAt: true,
            },
          },
          evidenceAutomations: {
            select: {
              id: true,
              name: true,
              setupStatus: true,
              runs: {
                orderBy: { createdAt: 'desc' },
                take: 3,
                select: {
                  id: true,
                  status: true,
                  success: true,
                  createdAt: true,
                },
              },
              codexRuns: {
                orderBy: { createdAt: 'desc' },
                take: 3,
                select: {
                  id: true,
                  status: true,
                  summary: true,
                  errorMessage: true,
                  createdAt: true,
                  screenshots: { select: { attachmentId: true } },
                },
              },
            },
          },
        },
      }),
      db.attachment.findMany({
        where: {
          organizationId,
          entityId: taskId,
          entityType: AttachmentEntityType.task,
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          type: true,
          url: true,
          createdAt: true,
          codexAutomationScreenshot: { select: { runId: true } },
        },
      }),
      db.organizationBrowserVm.findUnique({
        where: { organizationId },
        select: {
          state: true,
          projectId: true,
          codexConfirmedAt: true,
          lastActivityAt: true,
        },
      }),
    ]);
    if (!task) throw new NotFoundException('Task not found');

    const attachmentContext = await Promise.all(
      attachments.map(
        async ({ url, codexAutomationScreenshot, ...attachment }) => {
          const metadata = await objectStorage
            .getObjectMetadata({ organizationId, key: url })
            .catch(() => null);
          return {
            ...attachment,
            mimeType:
              metadata?.contentType ??
              inferMimeType(attachment.name, attachment.type),
            sizeBytes: metadata?.contentLength,
            sourceRunId: codexAutomationScreenshot?.runId ?? null,
          };
        },
      ),
    );

    return { task, attachments: attachmentContext, browserVm };
  }

  async extractAttachment({
    attachmentId,
    organizationId,
    taskId,
  }: {
    attachmentId: string;
    organizationId: string;
    taskId: string;
  }) {
    const attachment = await db.attachment.findFirst({
      where: {
        id: attachmentId,
        organizationId,
        entityId: taskId,
        entityType: AttachmentEntityType.task,
      },
      select: { id: true, name: true, type: true, url: true },
    });
    if (!attachment) throw new NotFoundException('Task attachment not found');

    const metadata = await objectStorage.getObjectMetadata({
      organizationId,
      key: attachment.url,
    });
    if ((metadata.contentLength ?? 0) > MAX_ATTACHMENT_BYTES) {
      throw new BadRequestException(
        'Attachment exceeds the 20 MB extraction limit',
      );
    }
    const buffer = await readObjectStreamToBuffer(
      objectStorage.streamObject({ organizationId, key: attachment.url }),
    );
    const mimeType =
      metadata.contentType ?? inferMimeType(attachment.name, attachment.type);
    const extracted = await extractContentFromFile(
      buffer.toString('base64'),
      mimeType,
    );
    return {
      attachmentId: attachment.id,
      name: attachment.name,
      mimeType,
      content: extracted.slice(0, MAX_EXTRACTED_CHARS),
      sourceTruncated: extracted.length > MAX_EXTRACTED_CHARS,
      totalChars: Math.min(extracted.length, MAX_EXTRACTED_CHARS),
    };
  }
}
