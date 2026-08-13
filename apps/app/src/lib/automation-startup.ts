export type StartupTaskResult = {
  automationId: string;
  needsIntervention: boolean;
};

type StartupTask = { id: string };

export async function runAutomationStartupQueue<T extends StartupTask>({
  onTaskComplete,
  onTaskStart,
  tasks,
  worker,
}: {
  onTaskComplete?: (task: T, result: StartupTaskResult | Error) => void;
  onTaskStart?: (task: T) => void;
  tasks: T[];
  worker: (task: T) => Promise<StartupTaskResult>;
}) {
  for (const task of tasks) {
    onTaskStart?.(task);
    try {
      const result = await worker(task);
      onTaskComplete?.(task, result);
    } catch (error) {
      onTaskComplete?.(
        task,
        error instanceof Error ? error : new Error('Automation startup failed'),
      );
    }
  }
}

export async function runAutomationQueueUntilEmpty<T>({
  claimNext,
  onFailure,
  worker,
}: {
  claimNext: () => Promise<T | null>;
  onFailure: (item: T, error: unknown) => Promise<void>;
  worker: (item: T) => Promise<void>;
}): Promise<number> {
  let attempted = 0;
  while (true) {
    const item = await claimNext();
    if (!item) return attempted;
    attempted += 1;
    try {
      await worker(item);
    } catch (error) {
      await onFailure(item, error);
    }
  }
}
