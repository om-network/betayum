import type { EvidenceAutomationRun } from '@db';
import { fireEvent, render, screen } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AutomationRunsCard } from './AutomationRunsCard';

vi.mock('@trycompai/design-system', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Button: ({ children, ...props }: { children: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@trycompai/design-system/icons', () => ({
  CheckmarkFilled: () => <span data-testid="checkmark" />,
  ChevronDown: () => <span data-testid="chevron-down" />,
  CopyToClipboard: () => <span data-testid="copy" />,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn() },
}));

type RunWithName = EvidenceAutomationRun & {
  evidenceAutomation: { name: string };
};

function makeRun(): RunWithName {
  const now = new Date('2026-06-25T12:00:00.000Z');
  return {
    id: 'ear_1',
    createdAt: now,
    updatedAt: now,
    evidenceAutomationId: 'aut_1',
    status: 'failed',
    startedAt: now,
    completedAt: now,
    success: false,
    error: 'Sanitized failure',
    logs: ['opened repository', 'checked workflow'],
    output: { result: 'missing evidence' },
    evaluationStatus: 'fail',
    evaluationReason: 'Evidence was not found',
    triggeredBy: 'manual',
    runDuration: 1530,
    version: 3,
    taskId: 'tsk_1',
    evidenceAutomation: { name: 'Evidence check' },
  };
}

describe('AutomationRunsCard', () => {
  it('renders run detail fields for the automation detail view', () => {
    render(<AutomationRunsCard runs={[makeRun()]} />);

    expect(screen.getByText('v3')).toBeInTheDocument();
    expect(screen.getByText('Fail')).toBeInTheDocument();
    expect(screen.getByText('1.5s')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Evidence check'));

    expect(screen.getByText('Evidence was not found')).toBeInTheDocument();
    expect(screen.getByText('Sanitized failure')).toBeInTheDocument();
    expect(screen.getByText('Logs')).toBeInTheDocument();
    expect(screen.getByText('Output')).toBeInTheDocument();
  });
});
