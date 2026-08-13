import { describe, expect, it, vi } from 'vitest';
import { runAutomationQueueUntilEmpty, runAutomationStartupQueue } from './automation-startup';

describe(runAutomationStartupQueue.name, () => {
  it('waits for each task and continues after an error', async () => {
    const events: string[] = [];
    let activeWorkers = 0;
    let maximumActiveWorkers = 0;
    const completed = vi.fn();

    await runAutomationStartupQueue({
      tasks: [{ id: 'tsk_1' }, { id: 'tsk_2' }, { id: 'tsk_3' }],
      onTaskStart: (task) => events.push(`start:${task.id}`),
      onTaskComplete: (task, result) => {
        events.push(`complete:${task.id}`);
        completed(task, result);
      },
      worker: async (task) => {
        activeWorkers += 1;
        maximumActiveWorkers = Math.max(maximumActiveWorkers, activeWorkers);
        await Promise.resolve();
        activeWorkers -= 1;
        if (task.id === 'tsk_2') throw new Error('Needs intervention');
        return { automationId: `aut_${task.id}`, needsIntervention: false };
      },
    });

    expect(maximumActiveWorkers).toBe(1);
    expect(events).toEqual([
      'start:tsk_1',
      'complete:tsk_1',
      'start:tsk_2',
      'complete:tsk_2',
      'start:tsk_3',
      'complete:tsk_3',
    ]);
    expect(completed.mock.calls[1]?.[1]).toBeInstanceOf(Error);
  });

  it('continues to the next task when the conversation needs intervention', async () => {
    const started: string[] = [];

    await runAutomationStartupQueue({
      tasks: [{ id: 'tsk_1' }, { id: 'tsk_2' }],
      onTaskStart: (task) => started.push(task.id),
      worker: async (task) => ({
        automationId: `aut_${task.id}`,
        needsIntervention: true,
      }),
    });

    expect(started).toEqual(['tsk_1', 'tsk_2']);
  });
});

describe(runAutomationQueueUntilEmpty.name, () => {
  it('attempts all seven persisted items when the fourth fails', async () => {
    const remaining = Array.from({ length: 7 }, (_, index) => ({ id: `tsk_${index + 1}` }));
    const attempted: string[] = [];
    const failed: string[] = [];

    const count = await runAutomationQueueUntilEmpty({
      claimNext: async () => remaining.shift() ?? null,
      worker: async (item) => {
        attempted.push(item.id);
        if (item.id === 'tsk_4') throw new Error('hard failure');
      },
      onFailure: async (item) => {
        failed.push(item.id);
      },
    });

    expect(count).toBe(7);
    expect(attempted).toEqual(['tsk_1', 'tsk_2', 'tsk_3', 'tsk_4', 'tsk_5', 'tsk_6', 'tsk_7']);
    expect(failed).toEqual(['tsk_4']);
  });
});
