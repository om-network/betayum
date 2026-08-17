import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();
vi.mock('@/lib/api-server', () => ({ serverApi: { post } }));

const { buildAutomationFinalizationTool } = await import('./automation-finalization-tool');

describe('finalizeAutomationReview', () => {
  beforeEach(() => vi.clearAllMocks());

  it('submits action-needed remarks and the concise required action', async () => {
    post.mockResolvedValue({ data: { taskStatus: 'in_review' }, status: 200 });
    const execute = buildAutomationFinalizationTool({
      automationId: 'aut_1',
      taskId: 'tsk_1',
    }).finalizeAutomationReview.execute;
    if (!execute) throw new Error('execute not defined');

    const result = await execute(
      {
        actionRequired: 'Connect the production GCP project.',
        outcome: 'action_needed',
        remarks: 'Evidence collection is blocked because no production project is connected.',
      },
      {} as never,
    );

    expect(post).toHaveBeenCalledWith('/v1/task-automation-queue/tsk_1/finalize', {
      actionRequired: 'Connect the production GCP project.',
      automationId: 'aut_1',
      outcome: 'action_needed',
      remarks: 'Evidence collection is blocked because no production project is connected.',
    });
    expect(result).toEqual({ success: true, outcome: 'action_needed', taskStatus: 'in_review' });
  });
});
