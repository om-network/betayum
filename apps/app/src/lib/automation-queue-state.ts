import { apiClient } from './api-client';

export type AutomationQueueItemStatus =
  | 'queued'
  | 'building'
  | 'ready'
  | 'action_needed'
  | 'failed';

export type AutomationQueueItem = {
  automationId: string | null;
  id: string;
  position: number;
  remarks: string | null;
  status: AutomationQueueItemStatus;
  task: { id: string; status: string; title: string };
  taskId: string;
};

export type AutomationQueue = {
  currentItemId: string | null;
  currentPosition: number;
  id: string;
  items: AutomationQueueItem[];
  status: 'active' | 'completed';
  triggerRunId: string | null;
};

export type ResetAutomationSetupsResult = {
  automationIds: string[];
  count: number;
  taskIds: string[];
};

export function isAutomationQueueResumable(queue: AutomationQueue | null | undefined) {
  return (
    queue?.items.some((item) => item.status === 'queued' || item.status === 'building') ?? false
  );
}

export async function getAutomationQueue(): Promise<AutomationQueue | null> {
  const response = await apiClient.get<AutomationQueue | null>('/v1/task-automation-queue');
  if (response.error) throw new Error(response.error);
  return response.data ?? null;
}

export async function startAutomationQueue(taskIds: string[]): Promise<AutomationQueue> {
  const response = await apiClient.post<AutomationQueue>('/v1/task-automation-queue', { taskIds });
  if (response.error || !response.data) {
    throw new Error(response.error ?? 'Failed to start automation queue');
  }
  return response.data;
}

export async function resetAutomationSetups(
  automationIds: string[],
): Promise<ResetAutomationSetupsResult> {
  const response = await apiClient.post<ResetAutomationSetupsResult>(
    '/v1/task-automation-queue/reset',
    { automationIds },
  );
  if (response.error || !response.data) {
    throw new Error(response.error ?? 'Failed to reset automation setup');
  }
  return response.data;
}
