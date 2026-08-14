const transactionDb = {
  evidenceAutomation: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};
const mockDb = {
  $transaction: jest.fn(
    async (callback: (tx: typeof transactionDb) => Promise<void>) =>
      callback(transactionDb),
  ),
  codexAutomationRun: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
};

jest.mock('@db', () => ({
  AutomationSetupStatus: {
    building: 'building',
    failed: 'failed',
    ready: 'ready',
  },
  CodexAutomationRunStatus: {
    dispatched: 'dispatched',
    pending: 'pending',
    timed_out: 'timed_out',
  },
  db: mockDb,
}));

import {
  expireStaleCodexAutomationRuns,
  reconcileCodexAutomation,
} from './codex-automation-reconciliation';

describe('Codex automation reconciliation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    transactionDb.evidenceAutomation.findUnique.mockResolvedValue({
      chatHistory: '[]',
      setupStatus: 'building',
    });
    transactionDb.evidenceAutomation.update.mockResolvedValue({});
  });

  it('appends feedback without finalizing the assistant conversation', async () => {
    await reconcileCodexAutomation({
      automationId: 'aut_1',
      message: 'Attached two screenshots.',
      runId: 'car_1',
      successful: true,
    });

    const data =
      transactionDb.evidenceAutomation.update.mock.calls[0]?.[0].data;
    expect(data).not.toHaveProperty('setupStatus');
    expect(JSON.parse(String(data.chatHistory))).toEqual([
      {
        id: 'codex-result-car_1',
        role: 'assistant',
        parts: [
          {
            type: 'text',
            text: '[codex-browser-run:car_1] Attached two screenshots.',
          },
        ],
      },
    ]);
  });

  it('does not duplicate feedback on a completion retry', async () => {
    transactionDb.evidenceAutomation.findUnique.mockResolvedValue({
      chatHistory: JSON.stringify([
        { id: 'codex-result-car_1', role: 'assistant', parts: [] },
      ]),
      setupStatus: 'ready',
    });

    await reconcileCodexAutomation({
      automationId: 'aut_1',
      message: 'Attached evidence.',
      runId: 'car_1',
      successful: true,
    });

    const data =
      transactionDb.evidenceAutomation.update.mock.calls[0]?.[0].data;
    expect(JSON.parse(String(data.chatHistory))).toHaveLength(1);
    expect(data).not.toHaveProperty('setupStatus');
  });

  it('expires stale runs without finalizing the assistant conversation', async () => {
    mockDb.codexAutomationRun.findMany.mockResolvedValue([
      { automationId: 'aut_1', id: 'car_old' },
    ]);
    mockDb.codexAutomationRun.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      expireStaleCodexAutomationRuns({ organizationId: 'org_1' }),
    ).resolves.toBe(1);

    expect(mockDb.codexAutomationRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          completedAt: expect.any(Date),
          status: 'timed_out',
        }),
      }),
    );
    const data =
      transactionDb.evidenceAutomation.update.mock.calls[0]?.[0].data;
    expect(data).not.toHaveProperty('setupStatus');
  });
});
