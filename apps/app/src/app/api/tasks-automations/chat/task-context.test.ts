import { describe, expect, it } from 'vitest';
import { automationTaskContextSchema, formatTaskContext } from './task-context';

describe('automation task context', () => {
  it('strips storage locations and unexpected secret fields before prompting', () => {
    const context = automationTaskContextSchema.parse({
      task: {
        id: 'tsk_1',
        title: 'Evidence task',
        description: '',
        status: 'todo',
        department: null,
        frequency: null,
        reviewDate: null,
        lastCompletedAt: null,
        assignee: null,
        approver: null,
        organization: { name: 'Example', website: null },
        controls: [],
        vendors: [],
        risks: [],
        findings: [],
        evidenceAutomations: [],
        accessToken: 'secret',
      },
      attachments: [
        {
          id: 'att_1',
          name: 'evidence.pdf',
          type: 'document',
          mimeType: 'application/pdf',
          createdAt: '2026-08-01T00:00:00.000Z',
          sourceRunId: null,
          url: 'private/object/key',
        },
      ],
      browserVm: null,
    });

    const formatted = formatTaskContext(context);

    expect(formatted).toContain('evidence.pdf');
    expect(formatted).not.toContain('private/object/key');
    expect(formatted).not.toContain('secret');
  });
});
