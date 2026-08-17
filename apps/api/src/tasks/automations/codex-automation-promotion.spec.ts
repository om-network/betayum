const mockDb = {
  codexAutomationRun: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};
const reconcileAutomation = jest.fn();

jest.mock('@db', () => ({
  AttachmentEntityType: { task: 'task' },
  AttachmentType: { image: 'image' },
  CodexAutomationRunStatus: {
    promoted: 'promoted',
    promoting: 'promoting',
  },
  db: mockDb,
}));
jest.mock('../../app/object-storage', () => ({ objectStorage: {} }));
jest.mock('./codex-automation-reconciliation', () => ({
  reconcileCodexAutomation: reconcileAutomation,
}));

import { promoteCodexAutomationScreenshots } from './codex-automation-promotion';

describe(promoteCodexAutomationScreenshots.name, () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.codexAutomationRun.findFirst.mockResolvedValue({
      automationId: 'aut_1',
      completedAt: new Date(),
      id: 'car_1',
      screenshots: [],
      summary: 'Required evidence was not present.',
      taskId: 'tsk_1',
    });
    mockDb.codexAutomationRun.update
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        automationId: 'aut_1',
        id: 'car_1',
        screenshots: [],
        summary: 'Required evidence was not present.',
      });
    reconcileAutomation.mockResolvedValue(undefined);
  });

  it('records feedback and releases the automation when no evidence was attached', async () => {
    await promoteCodexAutomationScreenshots({
      organizationId: 'org_1',
      runId: 'car_1',
    });

    expect(reconcileAutomation).toHaveBeenCalledWith({
      automationId: 'aut_1',
      message:
        'Codex completed without attaching screenshot evidence.\n\nRequired evidence was not present.',
      runId: 'car_1',
      successful: false,
    });
  });
});
