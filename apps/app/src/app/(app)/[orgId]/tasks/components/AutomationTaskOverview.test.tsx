import { resetAutomationSetups } from '@/lib/automation-queue-state';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AutomationTaskOverview,
  classifyAutomationTasks,
  type AutomationOverviewTask,
} from './AutomationTaskOverview';

const testState = vi.hoisted(() => ({ canUpdate: true }));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ hasPermission: () => testState.canUpdate }),
}));

vi.mock('@/lib/automation-queue-state', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/automation-queue-state')>();
  return {
    ...original,
    getAutomationQueue: vi.fn().mockResolvedValue(null),
    resetAutomationSetups: vi.fn(),
    startAutomationQueue: vi.fn(),
  };
});

const tasks: AutomationOverviewTask[] = [
  {
    id: 'tsk_stale_building',
    title: 'Code Changes',
    status: 'in_review',
    evidenceAutomations: [
      {
        id: 'aut_stale_building',
        name: 'Completed assistant',
        isEnabled: false,
        setupStatus: 'building',
        assistantRun: { status: 'completed' },
      },
    ],
  },
  {
    id: 'tsk_assistant_queued',
    title: 'Static Code Scanning',
    status: 'todo',
    evidenceAutomations: [
      {
        id: 'aut_assistant_queued',
        name: 'Queued follow-up',
        isEnabled: false,
        setupStatus: 'action_needed',
        assistantRun: { status: 'queued' },
      },
    ],
  },
  {
    id: 'tsk_running',
    title: 'Production Firewall & No-Public-Access Controls',
    status: 'in_progress',
    evidenceAutomations: [
      {
        id: 'aut_running',
        name: 'GCP collection',
        isEnabled: true,
        runs: [{ status: 'running', success: null, evaluationStatus: null }],
      },
    ],
  },
  {
    id: 'tsk_setup_ready',
    title: 'Secure Secrets',
    status: 'done',
    evidenceAutomations: [
      {
        id: 'aut_setup_ready',
        name: 'AI setup collection',
        isEnabled: true,
        setupStatus: 'ready',
      },
    ],
  },
  {
    id: 'tsk_ready',
    title: 'Code Changes',
    status: 'todo',
    evidenceAutomations: [
      {
        id: 'aut_ready',
        name: 'GitHub collection',
        isEnabled: true,
        runs: [{ status: 'completed', success: true, evaluationStatus: 'pass' }],
      },
    ],
  },
  {
    id: 'tsk_failed',
    title: 'Monitoring & Alerting',
    status: 'todo',
    evidenceAutomations: [
      {
        id: 'aut_failed',
        name: 'Logging collection',
        isEnabled: false,
        setupStatus: 'failed',
        setupTask: 'Automation setup failed.',
        runs: [{ status: 'failed', success: false, evaluationStatus: null }],
      },
    ],
  },
  {
    id: 'tsk_manual',
    title: 'Separation of Environments',
    status: 'todo',
  },
  {
    id: 'tsk_disabled',
    title: 'Encryption at Rest',
    status: 'todo',
    evidenceAutomations: [
      {
        id: 'aut_disabled',
        name: 'Disabled collection',
        isEnabled: false,
      },
    ],
  },
  {
    id: 'tsk_not_run',
    title: 'Static Code Scanning',
    status: 'todo',
    evidenceAutomations: [
      {
        id: 'aut_not_run',
        name: 'New collection',
        isEnabled: true,
      },
    ],
  },
  {
    id: 'tsk_done',
    title: 'Completed manual task',
    status: 'done',
  },
  {
    id: 'tsk_manual_only',
    title: 'Conduct an in-person interview',
    status: 'todo',
    automationStatus: 'MANUAL',
  },
  {
    id: 'tsk_building',
    title: 'App Availability',
    status: 'todo',
    evidenceAutomations: [
      {
        id: 'aut_building',
        name: 'Persisted build',
        isEnabled: false,
        setupStatus: 'building',
      },
    ],
  },
  {
    id: 'tsk_intervention',
    title: 'Code Changes',
    status: 'todo',
    evidenceAutomations: [
      {
        id: 'aut_intervention',
        name: 'Blocked build',
        isEnabled: false,
        setupStatus: 'action_needed',
        setupTask: 'Provide the GitHub organization and repository name.',
      },
    ],
  },
];

describe(AutomationTaskOverview.name, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.canUpdate = true;
  });

  it('groups tasks by current automation outcome and required action', () => {
    const groups = classifyAutomationTasks(tasks);

    expect(groups.automating.map((item) => item.taskId)).toEqual([
      'tsk_assistant_queued',
      'tsk_running',
      'tsk_building',
    ]);
    expect(groups.automating[0]?.action).toBe('Queued');
    expect(groups.automating.some((item) => item.taskId === 'tsk_stale_building')).toBe(false);
    expect(groups.automated.map((item) => item.taskId)).toEqual(['tsk_setup_ready', 'tsk_ready']);
    expect(groups.automated.find((item) => item.taskId === 'tsk_ready')?.resettable).toBe(false);
    expect(groups.automated.find((item) => item.taskId === 'tsk_setup_ready')?.resettable).toBe(
      true,
    );
    expect(groups.actionable.map((item) => [item.taskId, item.action])).toEqual([
      ['tsk_failed', 'Automation setup failed.'],
      ['tsk_intervention', 'Provide the GitHub organization and repository name.'],
    ]);
    expect(
      [...groups.automating, ...groups.automated, ...groups.actionable].some(
        (item) => item.taskId === 'tsk_manual_only',
      ),
    ).toBe(false);
  });

  it('renders direct links to existing and new automations', () => {
    render(<AutomationTaskOverview orgId="org_1" tasks={tasks} />);

    expect(screen.getByRole('link', { name: /Production Firewall/ })).toHaveAttribute(
      'href',
      '/org_1/tasks/tsk_running/automation/aut_running',
    );
    expect(screen.getByRole('link', { name: /Code Changes View automation/ })).toHaveAttribute(
      'href',
      '/org_1/tasks/tsk_ready/automation/aut_ready',
    );
    expect(
      screen.getByRole('link', {
        name: /Provide the GitHub organization and repository name/,
      }),
    ).toHaveAttribute('href', '/org_1/tasks/tsk_intervention/automation/aut_intervention');
  });

  it('shows at most ten tasks until see more is selected', () => {
    const actionableTasks = Array.from({ length: 11 }, (_, index) => ({
      id: `tsk_${index}`,
      title: index % 2 === 0 ? 'Code Changes' : 'Encryption at Rest',
      status: 'todo',
      evidenceAutomations: [
        {
          id: `aut_${index}`,
          name: `Automation ${index + 1}`,
          isEnabled: false,
          setupStatus: 'action_needed',
          setupTask: `Provide information ${index + 1}`,
        },
      ],
    }));

    render(<AutomationTaskOverview orgId="org_1" tasks={actionableTasks} />);

    expect(screen.getAllByText('Code Changes')).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'See more (1)' }));
    expect(screen.getAllByText('Code Changes')).toHaveLength(6);
    expect(screen.getByRole('button', { name: 'Show less' })).toBeInTheDocument();
  });

  it('shows the active task and every waiting task from the persisted queue', () => {
    const groups = classifyAutomationTasks(tasks, [
      {
        id: 'asi_1',
        taskId: 'tsk_building',
        automationId: 'aut_building',
        position: 0,
        remarks: null,
        status: 'building',
        task: { id: 'tsk_building', status: 'todo', title: 'App Availability' },
      },
      {
        id: 'asi_2',
        taskId: 'tsk_disabled',
        automationId: 'aut_disabled',
        position: 1,
        remarks: null,
        status: 'queued',
        task: { id: 'tsk_disabled', status: 'todo', title: 'Encryption at Rest' },
      },
    ]);

    expect(groups.automating.map((item) => [item.taskId, item.action])).toContainEqual([
      'tsk_building',
      'Collecting evidence',
    ]);
    expect(groups.automating.map((item) => [item.taskId, item.action])).toContainEqual([
      'tsk_disabled',
      'Queued',
    ]);
  });

  it('resets one terminal AI setup and refreshes task and queue state', async () => {
    vi.mocked(resetAutomationSetups).mockResolvedValue({
      automationIds: ['aut_intervention'],
      count: 1,
      taskIds: ['tsk_intervention'],
    });
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(<AutomationTaskOverview orgId="org_1" tasks={tasks} onRefresh={onRefresh} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reset Code Changes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    await waitFor(() => expect(resetAutomationSetups).toHaveBeenCalledWith(['aut_intervention']));
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });

  it('bulk resets every terminal AI setup but not manually successful automations', async () => {
    vi.mocked(resetAutomationSetups).mockResolvedValue({
      automationIds: ['aut_setup_ready', 'aut_failed', 'aut_intervention'],
      count: 3,
      taskIds: ['tsk_setup_ready', 'tsk_failed', 'tsk_intervention'],
    });
    render(
      <AutomationTaskOverview
        orgId="org_1"
        tasks={tasks}
        onRefresh={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getAllByRole('button', { name: 'Reset Code Changes' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Reset Secure Secrets' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reset all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    await waitFor(() =>
      expect(resetAutomationSetups).toHaveBeenCalledWith([
        'aut_setup_ready',
        'aut_failed',
        'aut_intervention',
      ]),
    );
  });

  it('hides reset controls without task update permission', () => {
    testState.canUpdate = false;
    render(<AutomationTaskOverview orgId="org_1" tasks={tasks} />);

    expect(screen.queryByRole('button', { name: 'Reset all' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reset Secure Secrets/ })).not.toBeInTheDocument();
  });

  it('shows the reset task in the next setup count after refreshed data arrives', async () => {
    const readyTask: AutomationOverviewTask = {
      id: 'tsk_ready_again',
      title: 'Secure Secrets',
      status: 'done',
      evidenceAutomations: [
        {
          id: 'aut_ready_again',
          isEnabled: true,
          name: 'AI setup collection',
          setupStatus: 'ready',
        },
      ],
    };
    vi.mocked(resetAutomationSetups).mockResolvedValue({
      automationIds: ['aut_ready_again'],
      count: 1,
      taskIds: ['tsk_ready_again'],
    });
    const { rerender } = render(
      <AutomationTaskOverview
        orgId="org_1"
        tasks={[readyTask]}
        onRefresh={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reset Secure Secrets' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(resetAutomationSetups).toHaveBeenCalled());

    rerender(
      <AutomationTaskOverview
        orgId="org_1"
        tasks={[
          {
            ...readyTask,
            status: 'todo',
            evidenceAutomations: [
              {
                ...readyTask.evidenceAutomations![0],
                isEnabled: false,
                setupStatus: null,
              },
            ],
          },
        ]}
      />,
    );

    expect(
      await screen.findByRole('button', { name: 'Start setup for 1 task' }),
    ).toBeInTheDocument();
  });
});
