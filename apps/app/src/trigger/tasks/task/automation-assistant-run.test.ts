import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = vi.hoisted(() => ({
  $executeRaw: vi.fn(),
  automationAssistantRun: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  },
  evidenceAutomation: { update: vi.fn() },
}));
const transaction = vi.hoisted(() =>
  vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
);

vi.mock('@db/server', () => ({
  db: {
    $transaction: transaction,
    automationAssistantCommand: { count: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    automationAssistantRun: { findFirst: vi.fn(), updateMany: vi.fn() },
    evidenceAutomation: { findUniqueOrThrow: vi.fn() },
  },
}));
vi.mock(
  '@/app/(app)/[orgId]/tasks/[taskId]/automation/[automationId]/lib/codex-run-monitor',
  () => ({
    buildCodexCompletionMessage: vi.fn(),
    findUnresolvedCodexRunIds: vi.fn(() => []),
    parseCodexRunResult: vi.fn(),
  }),
);
vi.mock('./automation-setup-queue', () => ({
  runAssistantTurn: vi.fn(),
  waitForCodex: vi.fn(),
}));

import {
  claimAutomationAssistantRun,
  type AutomationAssistantPayload,
} from './automation-assistant-run';

const payload: AutomationAssistantPayload = {
  automationId: 'aut_2',
  generation: 1,
  organizationId: 'org_1',
  requestedByUserId: 'usr_1',
  runId: 'aar_2',
  taskId: 'tsk_2',
};

describe(claimAutomationAssistantRun.name, () => {
  beforeEach(() => vi.clearAllMocks());

  it('leaves a second task queued while another task owns the organization lane', async () => {
    tx.automationAssistantRun.findFirst.mockResolvedValue({ id: 'aar_1' });

    await expect(claimAutomationAssistantRun(payload, 'trigger_2')).resolves.toBe(false);

    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    expect(tx.automationAssistantRun.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.automationAssistantRun.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'aar_2', generation: 1, status: 'queued' },
      data: { triggerRunId: null },
    });
    expect(tx.evidenceAutomation.update).not.toHaveBeenCalled();
  });

  it('claims the queued task when the organization lane is free', async () => {
    tx.automationAssistantRun.findFirst.mockResolvedValue(null);
    tx.automationAssistantRun.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    await expect(claimAutomationAssistantRun(payload, 'trigger_2')).resolves.toBe(true);

    expect(tx.evidenceAutomation.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'aut_2' } }),
    );
  });
});
