import { serverApi } from '@/lib/api-server';
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import type { AutomationTaskContext } from './task-context';

const CHUNK_SIZE = 12_000;
const extractionSchema = z.object({
  attachmentId: z.string(),
  name: z.string(),
  mimeType: z.string(),
  content: z.string(),
  sourceTruncated: z.boolean(),
  totalChars: z.number(),
});

export function buildReadTaskAttachmentTool({
  attachments,
  taskId,
}: {
  attachments: AutomationTaskContext['attachments'];
  taskId: string;
}): ToolSet {
  if (attachments.length === 0) return {};

  const attachmentIds = new Set(attachments.map((attachment) => attachment.id));
  const cache = new Map<string, z.infer<typeof extractionSchema>>();

  return {
    readTaskAttachment: tool({
      description:
        'Read an existing task attachment after its metadata indicates it may contain relevant evidence. Content is extracted read-only and returned in chunks.',
      inputSchema: z.object({
        attachmentId: z.string().describe('An attachment ID listed in task context'),
        offset: z.number().int().min(0).default(0),
      }),
      execute: async ({ attachmentId, offset }) => {
        if (!attachmentIds.has(attachmentId)) {
          return { success: false, error: 'Attachment is not part of this task' };
        }
        let extraction = cache.get(attachmentId);
        if (!extraction) {
          const response = await serverApi.post(
            `/v1/tasks/${taskId}/automation-context/attachments/${attachmentId}/extract`,
            {},
          );
          if (response.error) return { success: false, error: response.error };
          extraction = extractionSchema.parse(response.data);
          cache.set(attachmentId, extraction);
        }
        const content = extraction.content.slice(offset, offset + CHUNK_SIZE);
        return {
          success: true,
          attachmentId,
          name: extraction.name,
          mimeType: extraction.mimeType,
          content,
          offset,
          totalChars: extraction.totalChars,
          hasMore: offset + content.length < extraction.content.length,
          sourceTruncated: extraction.sourceTruncated,
        };
      },
    }),
  };
}
