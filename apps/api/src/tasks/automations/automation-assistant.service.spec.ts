const transactionDb = {
  automationAssistantCommand: { create: jest.fn(), findUnique: jest.fn() },
  automationAssistantRun: { findUnique: jest.fn(), upsert: jest.fn() },
  evidenceAutomation: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
};
const mockDb = {
  $transaction: jest.fn(
    async (callback: (tx: typeof transactionDb) => Promise<unknown>) =>
      callback(transactionDb),
  ),
  automationAssistantCommand: {
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  },
  automationAssistantRun: { findUnique: jest.fn(), updateMany: jest.fn() },
  evidenceAutomation: { findFirst: jest.fn() },
};
const triggerTask = jest.fn();

jest.mock('@db', () => ({
  AutomationAssistantRunStatus: {
    queued: 'queued',
    running: 'running',
  },
  Prisma: {
    TransactionIsolationLevel: { Serializable: 'Serializable' },
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {},
  },
  db: mockDb,
}));
jest.mock('@trigger.dev/sdk', () => ({
  tasks: { trigger: triggerTask },
}));

import { AutomationAssistantService } from './automation-assistant.service';

describe(AutomationAssistantService.name, () => {
  const service = new AutomationAssistantService();

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.evidenceAutomation.findFirst.mockResolvedValue({ id: 'aut_1' });
    transactionDb.automationAssistantCommand.findUnique.mockResolvedValue(null);
    transactionDb.automationAssistantRun.findUnique.mockResolvedValue({
      generation: 1,
      heartbeatAt: new Date(),
      status: 'waiting_for_input',
      updatedAt: new Date(),
    });
    transactionDb.automationAssistantRun.upsert.mockResolvedValue({
      generation: 2,
      id: 'aar_1',
      status: 'queued',
    });
    transactionDb.evidenceAutomation.findUniqueOrThrow.mockResolvedValue({
      chatHistory: JSON.stringify([
        {
          id: 'old',
          role: 'assistant',
          parts: [{ type: 'text', text: 'More info?' }],
        },
      ]),
    });
    triggerTask.mockResolvedValue({ id: 'trigger_1' });
    mockDb.automationAssistantRun.findUnique.mockResolvedValue({
      _count: { commands: 1 },
      id: 'aar_1',
      status: 'queued',
    });
  });

  it('persists and queues a follow-up without claiming that work has started', async () => {
    await service.submitMessage({
      automationId: 'aut_1',
      clientRequestId: 'message_1',
      organizationId: 'org_1',
      requestedByUserId: 'usr_1',
      taskId: 'tsk_1',
      text: 'https://github.com/example/repository',
    });

    expect(transactionDb.evidenceAutomation.update).toHaveBeenCalledWith({
      where: { id: 'aut_1' },
      data: {
        chatHistory: JSON.stringify([
          {
            id: 'old',
            role: 'assistant',
            parts: [{ type: 'text', text: 'More info?' }],
          },
          {
            id: 'message_1',
            role: 'user',
            parts: [
              { type: 'text', text: 'https://github.com/example/repository' },
            ],
          },
        ]),
        setupStatusUpdatedAt: expect.any(Date),
        setupTask: null,
      },
    });
    expect(triggerTask).toHaveBeenCalledWith(
      'automation-assistant-run',
      expect.objectContaining({ automationId: 'aut_1', generation: 2 }),
      { concurrencyKey: 'org_1', queue: 'organization-automation' },
    );
  });

  it('dispatches a replacement generation for a stale queued run', async () => {
    transactionDb.automationAssistantRun.findUnique.mockResolvedValue({
      generation: 2,
      heartbeatAt: null,
      status: 'queued',
      updatedAt: new Date(Date.now() - 10 * 60 * 1000),
    });
    transactionDb.automationAssistantRun.upsert.mockResolvedValue({
      generation: 3,
      id: 'aar_1',
      status: 'queued',
    });

    await service.submitMessage({
      automationId: 'aut_1',
      clientRequestId: 'message_2',
      organizationId: 'org_1',
      requestedByUserId: 'usr_1',
      taskId: 'tsk_1',
      text: 'Resume',
    });

    expect(transactionDb.automationAssistantRun.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ generation: 3, status: 'queued' }),
      }),
    );
    expect(triggerTask).toHaveBeenCalledWith(
      'automation-assistant-run',
      expect.objectContaining({ generation: 3 }),
      { concurrencyKey: 'org_1', queue: 'organization-automation' },
    );
  });
});
