'use client';

import { usePermissions } from '@/hooks/use-permissions';
import { isTaskAutomatable } from '@/lib/automation-eligibility';
import {
  getAutomationQueue,
  isAutomationQueueResumable,
  resetAutomationSetups,
  startAutomationQueue,
  type AutomationQueueItem,
} from '@/lib/automation-queue-state';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Section,
} from '@trycompai/design-system';
import { Checkmark, InProgress, Warning } from '@trycompai/design-system/icons';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { AutomationOverviewColumn, type AutomationOverviewItem } from './AutomationOverviewColumn';

type AutomationRun = {
  evaluationStatus: string | null;
  status: string;
  success: boolean | null;
};

type TaskAutomation = {
  assistantRun?: { status: string } | null;
  id: string;
  isEnabled: boolean;
  name: string;
  runs?: AutomationRun[];
  setupStatus?: string | null;
  setupTask?: string | null;
};

export type AutomationOverviewTask = {
  automationStatus?: string | null;
  evidenceAutomations?: TaskAutomation[];
  id: string;
  status: string;
  title: string;
};

export type AutomationTaskGroups = {
  actionable: AutomationOverviewItem[];
  automated: AutomationOverviewItem[];
  automating: AutomationOverviewItem[];
};

const isSuccessfulRun = (run: AutomationRun | undefined) =>
  run?.status === 'completed' && run.success === true && run.evaluationStatus !== 'fail';

export function classifyAutomationTasks(
  tasks: AutomationOverviewTask[],
  queueItems: AutomationQueueItem[] = [],
): AutomationTaskGroups {
  const groups: AutomationTaskGroups = {
    automating: [],
    automated: [],
    actionable: [],
  };

  const queuedTaskIds = new Set(
    queueItems
      .filter((item) => item.status === 'queued' || item.status === 'building')
      .map((item) => item.taskId),
  );
  for (const queueItem of queueItems) {
    if (queueItem.status !== 'queued' && queueItem.status !== 'building') continue;
    groups.automating.push({
      action: queueItem.status === 'building' ? 'Collecting evidence' : 'Queued',
      automationId: queueItem.automationId ?? undefined,
      taskId: queueItem.taskId,
      title: queueItem.task.title,
    });
  }

  for (const task of tasks) {
    if (task.automationStatus === 'MANUAL' || !isTaskAutomatable(task.title)) {
      continue;
    }

    const automations = task.evidenceAutomations ?? [];
    const activeAutomation = automations.find((automation) => automation.isEnabled);
    const trackedAutomation =
      automations.find((automation) => automation.setupStatus) ??
      activeAutomation ??
      automations[0];
    const latestRun = activeAutomation?.runs?.[0];
    const item = {
      taskId: task.id,
      title: task.title,
      automationId: trackedAutomation?.id,
    };

    if (queuedTaskIds.has(task.id)) continue;

    if (trackedAutomation?.assistantRun?.status === 'queued') {
      groups.automating.push({ ...item, action: 'Queued' });
      continue;
    }

    if (trackedAutomation?.assistantRun?.status === 'running') {
      groups.automating.push({ ...item, action: 'Collecting evidence' });
      continue;
    }

    if (trackedAutomation?.setupStatus === 'building' && !trackedAutomation.assistantRun) {
      groups.automating.push({ ...item, action: 'Collecting evidence' });
      continue;
    }

    if (latestRun?.status === 'running' || latestRun?.status === 'pending') {
      groups.automating.push({ ...item, action: 'View progress' });
      continue;
    }

    if (
      (trackedAutomation?.setupStatus === 'ready' && trackedAutomation.isEnabled) ||
      (activeAutomation && isSuccessfulRun(latestRun))
    ) {
      groups.automated.push({
        ...item,
        action: 'View automation',
        resettable: trackedAutomation?.setupStatus === 'ready',
      });
      continue;
    }

    if (task.status === 'done' || task.status === 'not_relevant') continue;

    if (trackedAutomation?.setupStatus === 'action_needed') {
      groups.actionable.push({
        ...item,
        action:
          trackedAutomation.setupTask ?? 'Provide the information requested by the assistant.',
        resettable: true,
      });
      continue;
    }

    if (trackedAutomation?.setupStatus === 'failed') {
      groups.actionable.push({
        ...item,
        action: trackedAutomation.setupTask ?? 'Automation setup failed. Review remarks and retry.',
        resettable: true,
      });
    }
  }

  return groups;
}

export function AutomationTaskOverview({
  onRefresh,
  orgId,
  tasks,
}: {
  onRefresh?: () => Promise<unknown>;
  orgId: string;
  tasks: AutomationOverviewTask[];
}) {
  const { hasPermission } = usePermissions();
  const [isStarting, setIsStarting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetTargets, setResetTargets] = useState<AutomationOverviewItem[] | null>(null);
  const {
    data: queue,
    isLoading: isQueueLoading,
    mutate: mutateQueue,
  } = useSWR(['automation-setup-queue', orgId], getAutomationQueue, {
    refreshInterval: (current) => (isAutomationQueueResumable(current) ? 3000 : 0),
    revalidateOnFocus: true,
    onSuccess: () => void onRefresh?.(),
  });
  const isQueueActive = isAutomationQueueResumable(queue);
  const groups = classifyAutomationTasks(tasks, queue?.items ?? []);
  const canUpdateTasks = hasPermission('task', 'update');
  const resettableItems = [...groups.automated, ...groups.actionable].filter(
    (item) => item.resettable && item.automationId,
  );
  const startupTasks = useMemo(
    () =>
      tasks.filter(
        (task) =>
          task.status !== 'done' &&
          task.status !== 'not_relevant' &&
          task.automationStatus !== 'MANUAL' &&
          isTaskAutomatable(task.title) &&
          !task.evidenceAutomations?.some((automation) => automation.isEnabled) &&
          !task.evidenceAutomations?.some(
            (automation) =>
              automation.setupStatus === 'building' ||
              automation.setupStatus === 'action_needed' ||
              automation.setupStatus === 'failed' ||
              automation.setupStatus === 'ready',
          ),
      ),
    [tasks],
  );

  const handleStart = async () => {
    setIsStarting(true);
    try {
      const nextQueue = await startAutomationQueue(startupTasks.map((task) => task.id));
      await mutateQueue(nextQueue, { revalidate: false });
      await onRefresh?.();
      toast.success('Automation setup queue started');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start automation queue');
    } finally {
      setIsStarting(false);
    }
  };

  const handleReset = async () => {
    if (!resetTargets) return;
    const automationIds = [
      ...new Set(
        resetTargets.map((item) => item.automationId).filter((id): id is string => Boolean(id)),
      ),
    ];
    if (automationIds.length === 0) return;

    setIsResetting(true);
    try {
      const result = await resetAutomationSetups(automationIds);
      await Promise.all([mutateQueue(), onRefresh?.()]);
      setResetTargets(null);
      toast.success(
        `Reset ${result.count} automation${result.count === 1 ? '' : 's'} for fresh setup`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to reset automation setup');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <>
      <Section
        title="Automation overview"
        description="Monitor active collection, completed automations, and work that needs attention"
        actions={
          canUpdateTasks &&
          (resettableItems.length > 0 ||
            (startupTasks.length > 0 && !isQueueLoading && !isQueueActive)) ? (
            <div className="flex items-center gap-2">
              {resettableItems.length > 0 ? (
                <Button
                  disabled={isResetting}
                  onClick={() => setResetTargets(resettableItems)}
                  variant="outline"
                >
                  Reset all
                </Button>
              ) : null}
              {startupTasks.length > 0 && !isQueueLoading && !isQueueActive ? (
                <Button
                  onClick={() => void handleStart()}
                  loading={isStarting}
                  disabled={isStarting || isResetting}
                >
                  {isStarting
                    ? 'Starting setup queue'
                    : `Start setup for ${startupTasks.length} task${startupTasks.length === 1 ? '' : 's'}`}
                </Button>
              ) : null}
            </div>
          ) : undefined
        }
      >
        <div className="grid grid-cols-1 gap-3 border-t pt-4 lg:grid-cols-3">
          <AutomationOverviewColumn
            title="Automating now"
            items={groups.automating}
            orgId={orgId}
            icon={<InProgress size={16} />}
            emptyMessage="No automations are running."
          />
          <AutomationOverviewColumn
            title="Automated"
            items={groups.automated}
            isResetting={isResetting}
            onReset={canUpdateTasks ? (item) => setResetTargets([item]) : undefined}
            orgId={orgId}
            icon={<Checkmark size={16} />}
            emptyMessage="No successful automations yet."
          />
          <AutomationOverviewColumn
            title="Action needed"
            items={groups.actionable}
            isResetting={isResetting}
            onReset={canUpdateTasks ? (item) => setResetTargets([item]) : undefined}
            orgId={orgId}
            icon={<Warning size={16} />}
            emptyMessage="Nothing needs attention."
          />
        </div>
      </Section>

      <AlertDialog
        open={resetTargets !== null}
        onOpenChange={(open) => {
          if (!open && !isResetting) setResetTargets(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {resetTargets?.length === 1
                ? 'Reset automation setup?'
                : 'Reset all automation setups?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This clears the current assistant conversation and setup draft so collection can start
              fresh. Previous runs, versions, remarks, and comments are retained. Completed tasks
              will reopen as Todo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResetting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isResetting}
              onClick={(event) => {
                event.preventDefault();
                void handleReset();
              }}
            >
              {isResetting ? 'Resetting...' : 'Reset'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
