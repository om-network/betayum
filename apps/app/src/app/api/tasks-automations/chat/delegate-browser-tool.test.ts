import { vi } from 'vitest';

const { mockPost, mockTrigger } = vi.hoisted(() => ({
  mockPost: vi.fn(),
  mockTrigger: vi.fn(),
}));

vi.mock('@trigger.dev/sdk', () => ({
  tasks: { trigger: mockTrigger },
}));
vi.mock('@/lib/api-server', () => ({
  serverApi: { post: mockPost },
}));

import { buildDelegateBrowserTool } from './delegate-browser-tool';

describe('buildDelegateBrowserTool', () => {
  afterEach(() => {
    delete process.env.CODEX_AUTOMATION_LOCAL_DIRECT;
  });

  it('dispatches a durable browser task with task scoping', async () => {
    mockTrigger.mockResolvedValue({ id: 'run_123' });
    const tools = buildDelegateBrowserTool({
      automationId: 'aut_123',
      organizationId: 'org_123',
      taskId: 'tsk_123',
    });

    const result = await tools.delegateBrowserTask.execute?.(
      {
        evidenceDescription: 'Show the active resources',
        prompt: 'Open the console and list active resources',
      },
      {
        abortSignal: undefined,
        messages: [],
        toolCallId: 'call_123',
      },
    );

    expect(mockTrigger).toHaveBeenCalledWith('delegate-browser-task', {
      automationId: 'aut_123',
      evidenceDescription: 'Show the active resources',
      organizationId: 'org_123',
      prompt: expect.stringContaining('Open the console and list active resources'),
      taskId: 'tsk_123',
    });
    expect(mockTrigger.mock.calls[0]?.[1].prompt).toContain(
      'Do not change settings, enable features, edit resources, remediate findings',
    );
    expect(mockTrigger.mock.calls[0]?.[1].prompt).toContain(
      'Report missing or insufficient evidence in the final summary',
    );
    expect(result).toEqual({ runId: 'run_123', status: 'dispatched' });
  });

  it('dispatches directly through the local API in local-direct mode', async () => {
    process.env.CODEX_AUTOMATION_LOCAL_DIRECT = 'true';
    mockPost.mockResolvedValue({
      data: { runId: 'car_123', status: 'pending' },
      error: null,
    });
    const tools = buildDelegateBrowserTool({
      automationId: 'aut_123',
      organizationId: 'org_123',
      taskId: 'tsk_123',
    });

    const result = await tools.delegateBrowserTask.execute?.(
      {
        evidenceDescription: 'Show the active resources',
        prompt: 'Open the console and capture the page',
      },
      { abortSignal: undefined, messages: [], toolCallId: 'call_123' },
    );

    expect(mockPost).toHaveBeenCalledWith('/v1/tasks/tsk_123/automations/aut_123/codex-runs', {
      evidenceDescription: 'Show the active resources',
      prompt: expect.stringContaining('Open the console and capture the page'),
    });
    expect(mockPost.mock.calls[0]?.[1].prompt).toContain(
      'Evidence collection is strictly read-only',
    );
    expect(result).toEqual({ runId: 'car_123', status: 'dispatched' });
  });
});
