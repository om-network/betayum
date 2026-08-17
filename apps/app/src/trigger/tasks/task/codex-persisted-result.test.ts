import { describe, expect, it } from 'vitest';
import { persistedCodexResult } from './codex-persisted-result';

describe(persistedCodexResult.name, () => {
  it('returns the stored VM failure instead of waiting for a Trigger result', () => {
    expect(
      persistedCodexResult({
        errorMessage: 'Browser VM SSH is unavailable',
        id: 'car_failed',
        screenshots: [],
        status: 'failed',
        summary: null,
      }),
    ).toEqual({
      output: { attachmentIds: [], summary: 'Browser VM SSH is unavailable' },
      status: 'FAILED',
    });
  });

  it('returns promoted attachments for a database-backed run', () => {
    expect(
      persistedCodexResult({
        errorMessage: null,
        id: 'car_complete',
        screenshots: [{ attachmentId: 'att_1' }, { attachmentId: null }],
        status: 'promoted',
        summary: 'Captured evidence.',
      }),
    ).toEqual({
      output: { attachmentIds: ['att_1'], summary: 'Captured evidence.' },
      status: 'COMPLETED',
    });
  });

  it('keeps active runs pending', () => {
    expect(
      persistedCodexResult({
        errorMessage: null,
        id: 'car_active',
        screenshots: [],
        status: 'dispatched',
        summary: null,
      }),
    ).toBeNull();
  });
});
