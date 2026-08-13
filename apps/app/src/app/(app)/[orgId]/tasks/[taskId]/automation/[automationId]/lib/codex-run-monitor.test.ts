import {
  buildCodexCompletionMessage,
  findUnresolvedCodexRunIds,
  parseCodexRunResult,
} from './codex-run-monitor';

describe('Codex run monitoring', () => {
  it('finds dispatched runs that do not have a completion follow-up', () => {
    expect(
      findUnresolvedCodexRunIds([
        {
          parts: [
            {
              type: 'tool-delegateBrowserTask',
              output: { runId: 'run_123', status: 'dispatched' },
            },
          ],
        },
      ]),
    ).toEqual(['run_123']);
  });

  it('does not restart monitoring after a completion follow-up', () => {
    expect(
      findUnresolvedCodexRunIds([
        {
          parts: [
            {
              type: 'tool-delegateBrowserTask',
              output: { runId: 'run_123', status: 'dispatched' },
            },
          ],
        },
        {
          parts: [{ type: 'text', text: '[codex-browser-run:run_123] completed' }],
        },
      ]),
    ).toEqual([]);
  });

  it('builds a follow-up containing verified attachment IDs', () => {
    expect(
      buildCodexCompletionMessage({
        attachmentIds: ['att_1', 'att_2'],
        runId: 'run_123',
        summary: 'Captured separate production and staging projects.',
      }),
    ).toContain('Attachment IDs: att_1, att_2');
  });

  it('validates a completed Trigger run result', () => {
    expect(
      parseCodexRunResult({
        output: { attachmentIds: ['att_1'], summary: 'Captured evidence.' },
        status: 'COMPLETED',
      }),
    ).toEqual({
      attachmentIds: ['att_1'],
      status: 'COMPLETED',
      summary: 'Captured evidence.',
    });
  });
});
