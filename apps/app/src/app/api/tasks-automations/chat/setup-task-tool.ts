import { serverApi } from '@/lib/api-server';
import { tool } from 'ai';
import { z } from 'zod';

export function buildSetupTaskTool({
  automationId,
  taskId,
}: {
  automationId: string;
  taskId: string;
}) {
  return {
    setSetupTask: tool({
      description:
        'Record the specific information or user action required before this automation can continue. Call immediately before promptForInfo or promptForSecret.',
      inputSchema: z.object({
        details: z
          .string()
          .trim()
          .min(1)
          .max(1000)
          .describe('A concise, user-facing description of what must be provided and why'),
      }),
      execute: async ({ details }) => {
        const result = await serverApi.patch(`/v1/tasks/${taskId}/automations/${automationId}`, {
          setupStatus: 'action_needed',
          setupTask: details,
        });
        if (result.error) return { success: false, error: result.error };
        return { success: true };
      },
    }),
  };
}
