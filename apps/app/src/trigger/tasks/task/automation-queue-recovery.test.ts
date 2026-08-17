import { describe, expect, it } from 'vitest';
import { needsAutomationQueueRecovery } from './automation-queue-recovery';

describe(needsAutomationQueueRecovery.name, () => {
  it('recovers a legacy building item after its Codex child terminates', () => {
    expect(
      needsAutomationQueueRecovery({
        automation: {
          assistantRun: null,
          codexRuns: [{ status: 'timed_out' }],
        },
        status: 'building',
      }),
    ).toBe(true);
  });

  it('does not duplicate an active durable assistant run', () => {
    expect(
      needsAutomationQueueRecovery({
        automation: {
          assistantRun: { status: 'running' },
          codexRuns: [{ status: 'timed_out' }],
        },
        status: 'building',
      }),
    ).toBe(false);
  });

  it('does not interrupt an active Codex child', () => {
    expect(
      needsAutomationQueueRecovery({
        automation: {
          assistantRun: null,
          codexRuns: [{ status: 'dispatched' }],
        },
        status: 'building',
      }),
    ).toBe(false);
  });
});
