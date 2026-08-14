import { serverApi } from '@/lib/api-server';
import { tool } from 'ai';
import { z } from 'zod';

const taskStatusSchema = z.enum([
  'todo',
  'in_progress',
  'in_review',
  'done',
  'not_relevant',
  'failed',
]);

interface BuildTaskStatusToolParams {
  taskId: string;
  approverId?: string | null;
}

interface TaskStatusResponse {
  status: z.infer<typeof taskStatusSchema>;
}

export function buildTaskStatusTool({ taskId, approverId }: BuildTaskStatusToolParams) {
  return {
    updateTaskStatus: tool({
      description:
        'Update the evidence task to the status selected by the LLM after evaluating the complete facts against the task requirements. When an approver is assigned, selecting done submits the task for review and the actual status becomes in_review.',
      inputSchema: z.object({
        status: taskStatusSchema.describe('The requested task status'),
        justification: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe('Required only when status is not_relevant'),
      }),
      execute: async ({ status, justification }) => {
        const requiresReview = status === 'in_review' || (status === 'done' && !!approverId);

        if (requiresReview && approverId) {
          const result = await serverApi.post<TaskStatusResponse>(
            `/v1/tasks/${taskId}/submit-for-review`,
            { approverId },
          );

          if (result.error) {
            return { success: false, error: result.error };
          }

          return {
            success: true,
            requestedStatus: status,
            status: result.data?.status ?? 'in_review',
            approvalRequired: true,
          };
        }

        if (status === 'not_relevant' && !justification) {
          return {
            success: false,
            error: 'A justification is required when marking a task not relevant.',
          };
        }

        const payload =
          status === 'not_relevant'
            ? { status, notRelevantJustification: justification }
            : { status };
        const result = await serverApi.patch<TaskStatusResponse>(`/v1/tasks/${taskId}`, payload);

        if (result.error) {
          return { success: false, error: result.error };
        }

        return {
          success: true,
          requestedStatus: status,
          status: result.data?.status ?? status,
          approvalRequired: false,
        };
      },
    }),
  };
}
