const tx = {
  $executeRaw: jest.fn(),
  automationSetupQueue: { update: jest.fn() },
  automationSetupQueueItem: { findFirst: jest.fn(), update: jest.fn() },
  comment: { create: jest.fn() },
  evidenceAutomation: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  task: { findFirst: jest.fn(), update: jest.fn() },
};
const mockDb = {
  $transaction: jest.fn(
    async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  ),
  automationSetupQueue: { findUnique: jest.fn(), update: jest.fn() },
  member: { findFirst: jest.fn() },
  task: { findMany: jest.fn() },
};
const trigger = jest.fn();

jest.mock('@db', () => ({
  AutomationSetupItemStatus: {
    action_needed: 'action_needed',
    building: 'building',
    failed: 'failed',
    queued: 'queued',
    ready: 'ready',
  },
  AutomationSetupQueueStatus: { active: 'active', completed: 'completed' },
  AutomationSetupStatus: {
    action_needed: 'action_needed',
    building: 'building',
    failed: 'failed',
    ready: 'ready',
  },
  TaskStatus: {
    done: 'done',
    in_review: 'in_review',
    not_relevant: 'not_relevant',
    todo: 'todo',
  },
  db: mockDb,
}));
jest.mock('@trigger.dev/sdk', () => ({ tasks: { trigger } }));

import { AutomationSetupQueueService } from './automation-setup-queue.service';
import { AutomationSetupOutcome } from './dto/automation-setup-queue.dto';

describe(AutomationSetupQueueService.name, () => {
  const service = new AutomationSetupQueueService();

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.member.findFirst.mockResolvedValue({ id: 'mem_1' });
    tx.evidenceAutomation.findFirst.mockResolvedValue({
      id: 'aut_1',
      setupStatus: 'building',
    });
    tx.automationSetupQueueItem.findFirst.mockResolvedValue(null);
    tx.task.findFirst.mockResolvedValue({ status: 'todo' });
  });

  it('atomically moves action-needed work to review with remarks and advances', async () => {
    tx.automationSetupQueueItem.findFirst
      .mockResolvedValueOnce({
        id: 'asi_1',
        position: 0,
        queueId: 'asq_1',
        status: 'building',
        queue: {},
      })
      .mockResolvedValueOnce({ id: 'asi_2', position: 1 });

    await service.finalize({
      dto: {
        actionRequired: 'Connect the production project.',
        automationId: 'aut_1',
        outcome: AutomationSetupOutcome.action_needed,
        remarks:
          'Collection is blocked because the production project is not connected.',
      },
      organizationId: 'org_1',
      taskId: 'tsk_1',
      userId: 'usr_1',
    });

    expect(tx.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'in_review' }),
      }),
    );
    expect(tx.comment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content:
            'Collection is blocked because the production project is not connected.',
        }),
      }),
    );
    expect(tx.evidenceAutomation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isEnabled: false,
          setupStatus: 'action_needed',
          setupTask: 'Connect the production project.',
        }),
      }),
    );
    expect(tx.automationSetupQueue.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentPosition: 1 }),
      }),
    );
  });

  it('redispatches an existing queued batch to the active worker', async () => {
    mockDb.automationSetupQueue.findUnique.mockResolvedValue({
      id: 'asq_1',
      organizationId: 'org_1',
      items: [{ status: 'queued' }],
    });
    trigger.mockResolvedValue({ id: 'run_replacement' });
    mockDb.automationSetupQueue.update.mockResolvedValue({
      id: 'asq_1',
      items: [{ status: 'queued' }],
      triggerRunId: 'run_replacement',
    });

    await expect(
      service.start({
        organizationId: 'org_1',
        requestedByUserId: 'usr_1',
        taskIds: ['tsk_1'],
      }),
    ).resolves.toMatchObject({ id: 'asq_1' });
    expect(mockDb.automationSetupQueue.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'asq_1' },
      data: { triggerRunId: null },
    });
    expect(trigger).toHaveBeenCalledWith(
      'automation-setup-queue',
      {
        organizationId: 'org_1',
        queueId: 'asq_1',
      },
      { concurrencyKey: 'org_1', queue: 'organization-automation' },
    );
    expect(mockDb.automationSetupQueue.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'asq_1' },
      data: { triggerRunId: 'run_replacement' },
      include: expect.any(Object),
    });
  });

  it('atomically clears terminal setup state and restores retryable task statuses', async () => {
    tx.evidenceAutomation.findMany.mockResolvedValue([
      {
        id: 'aut_ready',
        setupStatus: 'ready',
        taskId: 'tsk_review',
        task: { previousStatus: 'in_progress', status: 'in_review' },
      },
      {
        id: 'aut_action',
        setupStatus: 'action_needed',
        taskId: 'tsk_done',
        task: { previousStatus: null, status: 'done' },
      },
      {
        id: 'aut_failed',
        setupStatus: 'failed',
        taskId: 'tsk_na',
        task: { previousStatus: 'todo', status: 'not_relevant' },
      },
    ]);
    tx.automationSetupQueueItem.findFirst.mockResolvedValue(null);

    await expect(
      service.reset({
        automationIds: ['aut_ready', 'aut_action', 'aut_failed'],
        organizationId: 'org_1',
      }),
    ).resolves.toEqual({
      automationIds: ['aut_ready', 'aut_action', 'aut_failed'],
      count: 3,
      taskIds: ['tsk_review', 'tsk_done', 'tsk_na'],
    });

    expect(tx.evidenceAutomation.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['aut_ready', 'aut_action', 'aut_failed'] } },
      data: {
        allowedTools: [],
        chatHistory: null,
        evaluationCriteria: null,
        isEnabled: false,
        scriptDraft: null,
        setupStatus: null,
        setupStatusUpdatedAt: null,
        setupTask: null,
      },
    });
    expect(tx.task.update).toHaveBeenCalledWith({
      where: { id: 'tsk_review' },
      data: { previousStatus: null, status: 'in_progress' },
    });
    expect(tx.task.update).toHaveBeenCalledWith({
      where: { id: 'tsk_done' },
      data: { previousStatus: null, status: 'todo' },
    });
    expect(tx.task.update).toHaveBeenCalledWith({
      where: { id: 'tsk_na' },
      data: { previousStatus: null, status: 'not_relevant' },
    });
  });

  it('rejects a mixed invalid reset without changing any automation', async () => {
    tx.evidenceAutomation.findMany.mockResolvedValue([
      {
        id: 'aut_ready',
        setupStatus: 'ready',
        taskId: 'tsk_1',
        task: { previousStatus: null, status: 'todo' },
      },
    ]);

    await expect(
      service.reset({
        automationIds: ['aut_ready', 'aut_other_org'],
        organizationId: 'org_1',
      }),
    ).rejects.toThrow('Only terminal AI setup automations can be reset');
    expect(tx.evidenceAutomation.updateMany).not.toHaveBeenCalled();
    expect(tx.task.update).not.toHaveBeenCalled();
  });

  it('rejects duplicate or active automation resets', async () => {
    await expect(
      service.reset({
        automationIds: ['aut_1', 'aut_1'],
        organizationId: 'org_1',
      }),
    ).rejects.toThrow('Reset contains duplicate automations');

    tx.evidenceAutomation.findMany.mockResolvedValue([
      {
        id: 'aut_1',
        setupStatus: 'ready',
        taskId: 'tsk_1',
        task: { previousStatus: null, status: 'todo' },
      },
    ]);
    tx.automationSetupQueueItem.findFirst.mockResolvedValue({
      id: 'asi_active',
    });
    await expect(
      service.reset({ automationIds: ['aut_1'], organizationId: 'org_1' }),
    ).rejects.toThrow('An active automation cannot be reset');
    expect(tx.evidenceAutomation.updateMany).not.toHaveBeenCalled();
  });
});
