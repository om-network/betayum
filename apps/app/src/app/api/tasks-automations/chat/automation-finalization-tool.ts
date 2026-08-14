import { serverApi } from '@/lib/api-server';
import { tool } from 'ai';
import { z } from 'zod';

export function buildAutomationFinalizationTool({
  automationId,
  taskId,
}: {
  automationId: string;
  taskId: string;
}) {
  return {
    finalizeAutomationReview: tool({
      description:
        'Finish this automation attempt by submitting the task for review and attaching reviewer-facing remarks. Call exactly once after evidence collection succeeds, demonstrates a control gap, needs user action, or fails.',
      inputSchema: z
        .object({
          outcome: z.enum(['ready', 'action_needed', 'failed']),
          remarks: z
            .string()
            .trim()
            .min(1)
            .max(2000)
            .describe('Reviewer-facing summary of evidence, findings, blockers, and next steps'),
          actionRequired: z
            .string()
            .trim()
            .min(1)
            .max(1000)
            .optional()
            .describe('Concise user action required; mandatory for action_needed'),
        })
        .superRefine((value, context) => {
          if (value.outcome === 'action_needed' && !value.actionRequired) {
            context.addIssue({
              code: 'custom',
              message: 'actionRequired is required for action_needed',
              path: ['actionRequired'],
            });
          }
        }),
      execute: async ({ actionRequired, outcome, remarks }) => {
        const result = await serverApi.post(`/v1/task-automation-queue/${taskId}/finalize`, {
          actionRequired,
          automationId,
          outcome,
          remarks,
        });
        if (result.error) return { success: false, error: result.error };
        return { success: true, outcome, taskStatus: 'in_review' };
      },
    }),
  };
}
