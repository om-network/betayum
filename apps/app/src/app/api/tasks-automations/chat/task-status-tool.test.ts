import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPatch = vi.fn();
const mockPost = vi.fn();

vi.mock('@/lib/api-server', () => ({
  serverApi: {
    patch: mockPatch,
    post: mockPost,
  },
}));

const { buildTaskStatusTool } = await import('./task-status-tool');

const TASK_ID = 'tsk_test';

function getExecute(approverId?: string) {
  const tools = buildTaskStatusTool({ taskId: TASK_ID, approverId });
  if (!tools.updateTaskStatus.execute) {
    throw new Error('execute not defined on tool');
  }
  return tools.updateTaskStatus.execute;
}

describe('buildTaskStatusTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates an ordinary task status directly', async () => {
    mockPatch.mockResolvedValueOnce({
      data: { status: 'in_progress' },
      error: undefined,
      status: 200,
    });

    const result = await getExecute()({ status: 'in_progress' }, {} as never);

    expect(mockPatch).toHaveBeenCalledWith(`/v1/tasks/${TASK_ID}`, {
      status: 'in_progress',
    });
    expect(result).toEqual({
      success: true,
      requestedStatus: 'in_progress',
      status: 'in_progress',
      approvalRequired: false,
    });
  });

  it('submits for review when done is requested with an approver', async () => {
    mockPost.mockResolvedValueOnce({
      data: { status: 'in_review' },
      error: undefined,
      status: 200,
    });

    const result = await getExecute('mem_approver')({ status: 'done' }, {} as never);

    expect(mockPost).toHaveBeenCalledWith(`/v1/tasks/${TASK_ID}/submit-for-review`, {
      approverId: 'mem_approver',
    });
    expect(mockPatch).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      requestedStatus: 'done',
      status: 'in_review',
      approvalRequired: true,
    });
  });

  it('marks the task done directly when no approver is assigned', async () => {
    mockPatch.mockResolvedValueOnce({
      data: { status: 'done' },
      error: undefined,
      status: 200,
    });

    const result = await getExecute()({ status: 'done' }, {} as never);

    expect(mockPatch).toHaveBeenCalledWith(`/v1/tasks/${TASK_ID}`, {
      status: 'done',
    });
    expect(mockPost).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      requestedStatus: 'done',
      status: 'done',
      approvalRequired: false,
    });
  });

  it('submits explicitly requested in_review status through the review endpoint', async () => {
    mockPost.mockResolvedValueOnce({
      data: { status: 'in_review' },
      error: undefined,
      status: 200,
    });

    const result = await getExecute('mem_approver')({ status: 'in_review' }, {} as never);

    expect(mockPost).toHaveBeenCalledWith(`/v1/tasks/${TASK_ID}/submit-for-review`, {
      approverId: 'mem_approver',
    });
    expect(result).toMatchObject({
      success: true,
      status: 'in_review',
      approvalRequired: true,
    });
  });

  it('allows in_review without an assigned approver', async () => {
    mockPatch.mockResolvedValueOnce({
      data: { status: 'in_review' },
      error: undefined,
      status: 200,
    });

    const result = await getExecute()({ status: 'in_review' }, {} as never);

    expect(mockPatch).toHaveBeenCalledWith(`/v1/tasks/${TASK_ID}`, {
      status: 'in_review',
    });
    expect(result).toMatchObject({ success: true, status: 'in_review' });
  });

  it('requires justification when marking a task not relevant', async () => {
    const result = await getExecute()({ status: 'not_relevant' }, {} as never);

    expect(mockPatch).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: false,
      error: 'A justification is required when marking a task not relevant.',
    });
  });

  it('passes the not relevant justification to the API', async () => {
    mockPatch.mockResolvedValueOnce({
      data: { status: 'not_relevant' },
      error: undefined,
      status: 200,
    });

    await getExecute()(
      {
        status: 'not_relevant',
        justification: 'The service is outside the audit scope.',
      },
      {} as never,
    );

    expect(mockPatch).toHaveBeenCalledWith(`/v1/tasks/${TASK_ID}`, {
      status: 'not_relevant',
      notRelevantJustification: 'The service is outside the audit scope.',
    });
  });

  it('returns the API error when a status update fails', async () => {
    mockPatch.mockResolvedValueOnce({
      data: undefined,
      error: 'Cannot change status directly while task is in review.',
      status: 400,
    });

    const result = await getExecute()({ status: 'failed' }, {} as never);

    expect(result).toEqual({
      success: false,
      error: 'Cannot change status directly while task is in review.',
    });
  });
});
