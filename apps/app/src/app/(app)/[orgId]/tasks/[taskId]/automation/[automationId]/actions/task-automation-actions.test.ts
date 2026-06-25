import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  executeAutomationScript,
  getAutomationRunStatus,
  publishAutomation,
  saveChatHistory,
} from './task-automation-actions';

const serverApiPost = vi.hoisted(() => vi.fn());
const serverApiGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-server', () => ({
  serverApi: {
    get: serverApiGet,
    post: serverApiPost,
  },
}));

describe('task automation actions', () => {
  beforeEach(() => {
    serverApiGet.mockReset();
    serverApiPost.mockReset();
  });

  it('starts manual runs through the first-party automation API', async () => {
    serverApiPost.mockResolvedValue({
      data: { success: true, run: { id: 'ear_1' } },
      error: null,
    });

    const result = await executeAutomationScript({
      orgId: 'org_1',
      taskId: 'tsk_1',
      automationId: 'aut_1',
      version: 3,
    });

    expect(serverApiPost).toHaveBeenCalledWith('/v1/tasks/tsk_1/automations/aut_1/runs', {
      version: 3,
    });
    expect(result).toEqual({ success: true, data: { runId: 'ear_1' } });
  });

  it('does not start manual runs without a published version', async () => {
    const request = {
      orgId: 'org_1',
      taskId: 'tsk_1',
      automationId: 'aut_1',
    } as unknown as Parameters<typeof executeAutomationScript>[0];

    const result = await executeAutomationScript(request);

    expect(serverApiPost).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: false,
      error: 'Select a published automation version before running it.',
    });
  });

  it('publishes versions through the first-party automation API', async () => {
    serverApiPost.mockResolvedValue({
      data: { success: true, version: { version: 4 } },
      error: null,
    });

    const result = await publishAutomation('org_1', 'tsk_1', 'aut_1', 'Stable draft');

    expect(serverApiPost).toHaveBeenCalledWith('/v1/tasks/tsk_1/automations/aut_1/versions', {
      scriptKey: expect.stringMatching(/^first-party:\/\/org_1\/tsk_1\/aut_1\/snapshots\/.+/),
      changelog: 'Stable draft',
    });
    expect(result).toEqual({ success: true, version: { version: 4 } });
  });

  it('loads run status through the first-party automation API', async () => {
    serverApiGet.mockResolvedValue({
      data: {
        success: true,
        run: {
          id: 'ear_1',
          status: 'completed',
          success: true,
          output: { ok: true },
          evaluationStatus: 'pass',
          evaluationReason: 'Evidence attached',
        },
      },
      error: null,
    });

    const result = await getAutomationRunStatus({
      taskId: 'tsk_1',
      runId: 'ear_1',
    });

    expect(serverApiGet).toHaveBeenCalledWith('/v1/tasks/tsk_1/automations/runs/ear_1');
    expect(result).toEqual({
      success: true,
      data: {
        id: 'ear_1',
        status: 'COMPLETED',
        error: undefined,
        output: {
          success: true,
          error: undefined,
          output: { ok: true },
          evaluationStatus: 'pass',
          evaluationReason: 'Evidence attached',
        },
      },
    });
  });

  it('saves chat history through the first-party automation API', async () => {
    serverApiPost.mockResolvedValue({ data: { success: true }, error: null });

    const result = await saveChatHistory({
      taskId: 'tsk_1',
      automationId: 'aut_1',
      messages: [{ id: 'msg_1' }],
    });

    expect(serverApiPost).toHaveBeenCalledWith('/v1/tasks/tsk_1/automations/aut_1/chat-history', {
      messages: [{ id: 'msg_1' }],
    });
    expect(result).toEqual({ success: true });
  });
});
