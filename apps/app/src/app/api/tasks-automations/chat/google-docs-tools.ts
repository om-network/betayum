import { serverApi } from '@/lib/api-server';
import { tool } from 'ai';
import { z } from 'zod';

const DOC_CHUNK_SIZE = 4000;

interface GoogleDocsToolsParams {
  taskId: string;
  automationId: string;
}

interface DocReadResponse {
  documentId: string;
  title: string;
  content: string;
}

export function buildGoogleDocsTools({ taskId, automationId }: GoogleDocsToolsParams) {
  return {
    createGoogleDoc: tool({
      description:
        'Create a new Google Doc in the connected Google account to log evidence collection results. Use after running a script to save its output.',
      inputSchema: z.object({
        title: z.string().describe('Title for the Google Doc'),
        content: z.string().describe('Initial content to write into the document'),
      }),
      execute: async ({ title, content }) => {
        const result = await serverApi.post<{ documentId: string; documentUrl: string }>(
          `/v1/tasks/${taskId}/automations/${automationId}/google-docs`,
          { title, content },
        );
        if (result.error || !result.data?.documentId) {
          return { success: false, error: result.error ?? 'Failed to create document' };
        }
        return {
          success: true,
          documentId: result.data.documentId,
          documentUrl: result.data.documentUrl,
        };
      },
    }),
    updateGoogleDoc: tool({
      description:
        'Append content to an existing Google Doc to add new evidence results. Use the documentId returned by createGoogleDoc.',
      inputSchema: z.object({
        documentId: z.string().describe('The ID of the Google Doc to append to'),
        content: z.string().describe('Content to append to the document'),
      }),
      execute: async ({ documentId, content }) => {
        const result = await serverApi.post<{ success: boolean }>(
          `/v1/tasks/${taskId}/automations/${automationId}/google-docs/${documentId}/append`,
          { content },
        );
        if (result.error) {
          return { success: false, error: result.error };
        }
        return { success: result.data?.success ?? true };
      },
    }),
    readGoogleDoc: tool({
      description:
        'Read a chunk of an existing Google Doc by character offset. Use to verify contents before appending or to review previously logged evidence. Call repeatedly with increasing offsets until hasMore is false.',
      inputSchema: z.object({
        documentId: z.string().describe('The ID of the Google Doc to read'),
        offset: z.number().int().min(0).default(0).describe('Character offset to start reading from'),
      }),
      execute: async ({ documentId, offset }) => {
        const result = await serverApi.get<DocReadResponse>(
          `/v1/tasks/${taskId}/automations/${automationId}/google-docs/${documentId}`,
        );
        if (result.error || !result.data) {
          return { success: false, error: result.error ?? 'Failed to read document' };
        }
        const { title, content } = result.data;
        const totalChars = content.length;
        const safeOffset = Math.min(offset, totalChars);
        const chunk = content.slice(safeOffset, safeOffset + DOC_CHUNK_SIZE);
        const nextOffset = safeOffset + chunk.length;
        const hasMore = nextOffset < totalChars;
        return { title, chunk, offset: safeOffset, nextOffset, totalChars, hasMore };
      },
    }),
  };
}
