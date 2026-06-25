import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  executeAutomationScript,
  publishAutomation,
  saveChatHistory,
} from './task-automation-actions';

const serverApiPost = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-server', () => ({
  serverApi: {
    post: serverApiPost,
  },
}));

describe('task automation actions', () => {
  beforeEach(() => {
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

  it('publishes versions through the first-party automation API', async () => {
    serverApiPost.mockResolvedValue({
      data: { success: true, version: { version: 4 } },
      error: null,
    });

    const result = await publishAutomation('org_1', 'tsk_1', 'aut_1', 'Stable draft');

    expect(serverApiPost).toHaveBeenCalledWith('/v1/tasks/tsk_1/automations/aut_1/versions', {
      scriptKey: 'first-party://org_1/tsk_1/aut_1/draft',
      changelog: 'Stable draft',
    });
    expect(result).toEqual({ success: true, version: { version: 4 } });
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
