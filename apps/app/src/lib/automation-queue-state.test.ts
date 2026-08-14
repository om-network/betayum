import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
const post = vi.fn();

vi.mock('./api-client', () => ({ apiClient: { get, post } }));

const {
  getAutomationQueue,
  isAutomationQueueResumable,
  resetAutomationSetups,
  startAutomationQueue,
} = await import('./automation-queue-state');

describe('automation queue state', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads the persisted backend queue', async () => {
    get.mockResolvedValue({ data: { id: 'asq_1', items: [] }, status: 200 });

    await expect(getAutomationQueue()).resolves.toMatchObject({ id: 'asq_1' });
    expect(get).toHaveBeenCalledWith('/v1/task-automation-queue');
  });

  it('starts an ordered backend queue', async () => {
    post.mockResolvedValue({ data: { id: 'asq_1', items: [] }, status: 201 });

    await startAutomationQueue(['tsk_1', 'tsk_2']);

    expect(post).toHaveBeenCalledWith('/v1/task-automation-queue', {
      taskIds: ['tsk_1', 'tsk_2'],
    });
  });

  it('resets terminal automation setups through the backend', async () => {
    post.mockResolvedValue({
      data: { automationIds: ['aut_1'], count: 1, taskIds: ['tsk_1'] },
      status: 201,
    });

    await expect(resetAutomationSetups(['aut_1'])).resolves.toMatchObject({ count: 1 });
    expect(post).toHaveBeenCalledWith('/v1/task-automation-queue/reset', {
      automationIds: ['aut_1'],
    });
  });

  it('treats queued or building work as resumable', () => {
    const queue = (status: 'queued' | 'building' | 'ready') => ({
      currentItemId: null,
      currentPosition: 0,
      id: 'asq_1',
      items: [{ status }],
      status: 'active' as const,
      triggerRunId: null,
    });

    expect(isAutomationQueueResumable(queue('queued') as never)).toBe(true);
    expect(isAutomationQueueResumable(queue('building') as never)).toBe(true);
    expect(isAutomationQueueResumable(queue('ready') as never)).toBe(false);
  });
});
