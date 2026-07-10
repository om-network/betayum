import type { EvidenceAutomation, EvidenceAutomationRun } from '@db';
import { render, screen } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TaskAutomations } from './TaskAutomations';

vi.mock('next/navigation', () => ({
  useParams: () => ({ orgId: 'org_1', taskId: 'tsk_1' }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('@trycompai/design-system/icons', () => ({
  Add: () => <span data-testid="add" />,
  ArrowRight: () => <span data-testid="arrow-right" />,
  Download: () => <span data-testid="download" />,
}));

vi.mock('@trycompai/design-system', () => ({
  Button: ({
    children,
    iconLeft,
    ...props
  }: {
    children: React.ReactNode;
    iconLeft?: React.ReactNode;
  }) => (
    <button {...props}>
      {iconLeft}
      {children}
    </button>
  ),
  HStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Section: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@/components/schedule-summary', () => ({
  ScheduleSummary: () => <span data-testid="schedule-summary" />,
}));

vi.mock('@/lib/evidence-download', () => ({
  downloadAutomationPDF: vi.fn(),
}));

vi.mock('../hooks/use-task-automations', () => ({
  useTaskAutomations: () => ({ mutate: vi.fn() }),
}));

type AutomationWithRun = EvidenceAutomation & {
  runs: EvidenceAutomationRun[];
};

function makeAutomation({
  id,
  isEnabled = true,
  run,
}: {
  id: string;
  isEnabled?: boolean;
  run?: Partial<EvidenceAutomationRun>;
}): AutomationWithRun {
  const now = new Date('2026-06-25T12:00:00.000Z');

  return {
    id,
    name: `Automation ${id}`,
    description: null,
    createdAt: now,
    isEnabled,
    scheduleFrequency: 'daily',
    lastRunAt: null,
    chatHistory: null,
    evaluationCriteria: null,
    scriptDraft: null,
    allowedTools: [],
    taskId: 'tsk_1',
    runs: run
      ? [
          {
            id: `run_${id}`,
            createdAt: now,
            updatedAt: now,
            evidenceAutomationId: id,
            status: run.status ?? 'completed',
            startedAt: null,
            completedAt: null,
            success: null,
            error: null,
            logs: null,
            output: null,
            evaluationStatus: run.evaluationStatus ?? null,
            evaluationReason: null,
            triggeredBy: 'manual',
            runDuration: null,
            version: run.version ?? 1,
            taskId: 'tsk_1',
          },
        ]
      : [],
  };
}

describe('TaskAutomations', () => {
  it('renders task-level automation statuses', () => {
    render(
      <TaskAutomations
        automations={[
          makeAutomation({ id: 'passed', run: { status: 'completed' } }),
          makeAutomation({
            id: 'failed',
            run: { status: 'completed', evaluationStatus: 'fail' },
          }),
          makeAutomation({ id: 'running', run: { status: 'running' } }),
          makeAutomation({ id: 'ready' }),
          makeAutomation({ id: 'disabled', isEnabled: false }),
        ]}
      />,
    );

    expect(screen.getByText('Passed')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });
});
