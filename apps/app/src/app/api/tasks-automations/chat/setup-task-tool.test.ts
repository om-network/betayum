import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPatch = vi.fn();

vi.mock('@/lib/api-server', () => ({
  serverApi: { patch: mockPatch },
}));

const { buildSetupTaskTool } = await import('./setup-task-tool');

function getExecute() {
  const tools = buildSetupTaskTool({
    automationId: 'aut_1',
    taskId: 'tsk_1',
  });
  if (!tools.setSetupTask.execute) throw new Error('execute not defined on tool');
  return tools.setSetupTask.execute;
}

describe(buildSetupTaskTool.name, () => {
  beforeEach(() => vi.clearAllMocks());

  it('persists the required user action and marks setup as action needed', async () => {
    mockPatch.mockResolvedValueOnce({ data: {}, status: 200 });

    const result = await getExecute()(
      { details: 'Provide the GCP project that contains production resources.' },
      {} as never,
    );

    expect(mockPatch).toHaveBeenCalledWith('/v1/tasks/tsk_1/automations/aut_1', {
      setupStatus: 'action_needed',
      setupTask: 'Provide the GCP project that contains production resources.',
    });
    expect(result).toEqual({ success: true });
  });

  it('returns the API error', async () => {
    mockPatch.mockResolvedValueOnce({ error: 'Forbidden', status: 403 });

    const result = await getExecute()({ details: 'Provide the repository.' }, {} as never);

    expect(result).toEqual({ success: false, error: 'Forbidden' });
  });
});
