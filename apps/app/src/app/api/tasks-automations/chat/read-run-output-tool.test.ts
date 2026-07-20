import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api-server', () => ({
  serverApi: {
    get: vi.fn(),
  },
}));

import { serverApi } from '@/lib/api-server';
import { buildReadRunOutputTool } from './read-run-output-tool';

const mockedGet = vi.mocked(serverApi.get);

const TASK_ID = 'tsk_test';
const AUTOMATION_ID = 'aut_test';
const RUN_ID = 'run_test';

function getExecute() {
  const tools = buildReadRunOutputTool({ taskId: TASK_ID, automationId: AUTOMATION_ID });
  return tools.readRunOutput.execute as (args: { runId: string; offset: number }, opts: unknown) => Promise<unknown>;
}

describe('buildReadRunOutputTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns first chunk with hasMore true when output exceeds chunk size', async () => {
    const longOutput = 'x'.repeat(5000);
    mockedGet.mockResolvedValueOnce({
      data: { run: { output: longOutput, status: 'completed' } },
      error: undefined,
      status: 200,
    });

    const execute = getExecute();
    const result = await execute({ runId: RUN_ID, offset: 0 }, {}) as Record<string, unknown>;

    expect(result.offset).toBe(0);
    expect(result.nextOffset).toBe(4000);
    expect((result.chunk as string).length).toBe(4000);
    expect(result.hasMore).toBe(true);
    expect(result.totalChars).toBe(5000);
  });

  it('returns final chunk with hasMore false', async () => {
    const longOutput = 'y'.repeat(5000);
    mockedGet.mockResolvedValueOnce({
      data: { run: { output: longOutput, status: 'completed' } },
      error: undefined,
      status: 200,
    });

    const execute = getExecute();
    const result = await execute({ runId: RUN_ID, offset: 4000 }, {}) as Record<string, unknown>;

    expect(result.offset).toBe(4000);
    expect(result.hasMore).toBe(false);
    expect((result.chunk as string).length).toBe(1000);
    expect(result.nextOffset).toBe(5000);
  });

  it('returns middle chunk with correct nextOffset', async () => {
    const longOutput = 'z'.repeat(10000);
    mockedGet.mockResolvedValueOnce({
      data: { run: { output: longOutput, status: 'completed' } },
      error: undefined,
      status: 200,
    });

    const execute = getExecute();
    const result = await execute({ runId: RUN_ID, offset: 4000 }, {}) as Record<string, unknown>;

    expect(result.offset).toBe(4000);
    expect(result.nextOffset).toBe(8000);
    expect(result.hasMore).toBe(true);
  });

  it('returns error when run not found', async () => {
    mockedGet.mockResolvedValueOnce({
      data: null,
      error: 'Run not found',
      status: 404,
    });

    const execute = getExecute();
    const result = await execute({ runId: RUN_ID, offset: 0 }, {}) as Record<string, unknown>;

    expect(result.error).toBeDefined();
  });

  it('serializes object output as JSON', async () => {
    const objectOutput = { key: 'value', count: 42 };
    mockedGet.mockResolvedValueOnce({
      data: { run: { output: objectOutput, status: 'completed' } },
      error: undefined,
      status: 200,
    });

    const execute = getExecute();
    const result = await execute({ runId: RUN_ID, offset: 0 }, {}) as Record<string, unknown>;

    expect(result.chunk).toContain('"key": "value"');
    expect(result.hasMore).toBe(false);
  });
});
