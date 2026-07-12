import { serverApi } from '@/lib/api-server';
import { tool } from 'ai';
import { z } from 'zod';

interface GoogleDocsToolsParams {
  taskId: string;
  automationId: string;
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
  };
}
