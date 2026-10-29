import type { PentestIssue } from '@/lib/security/penetration-tests-client';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FindingDetail } from './FindingDetail';

const issue: PentestIssue = {
  id: 'issue_1',
  title: 'Exposed endpoint',
  severity: 'high',
  status: 'open',
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
};

describe('finding supporting details', () => {
  it('does not expose executable screenshot URLs', async () => {
    render(
      <FindingDetail
        issue={{
          ...issue,
          evidence: [
            {
              type: 'screenshot',
              screenshotUrl: 'javascript:alert(1)',
              annotation: 'Invalid screenshot',
            },
          ],
        }}
        onBack={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Evidence' }));
    expect(screen.queryByRole('link', { name: 'Open screenshot' })).not.toBeInTheDocument();
    expect(screen.getByText('Screenshot unavailable.')).toBeInTheDocument();
  });

  it('shows provider validation steps rather than discarding them', async () => {
    render(
      <FindingDetail
        issue={{
          ...issue,
          validationSteps: [{ description: 'Repeat the authorized request', verified: true }],
        }}
        onBack={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Validation' }));
    expect(screen.getByText('Repeat the authorized request')).toBeInTheDocument();
    expect(screen.getByText('Verified')).toBeInTheDocument();
  });

  it('shows HTTP, code, and screenshot evidence without rendering response HTML', async () => {
    render(
      <FindingDetail
        issue={{
          ...issue,
          evidence: [
            {
              type: 'http',
              method: 'GET',
              url: 'https://example.com/private',
              responseStatus: 200,
              responseBody: '<script>unsafe()</script>',
              annotation: 'Unauthorized response',
            },
            {
              type: 'code',
              filePath: 'auth.ts',
              startLine: 3,
              endLine: 5,
              snippet: 'return true;',
              annotation: 'Missing authorization',
            },
            {
              type: 'screenshot',
              screenshotUrl: 'https://example.com/proof.png',
              annotation: 'Screenshot proof',
            },
          ],
        }}
        onBack={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Evidence' }));
    expect(screen.getByText('Unauthorized response')).toBeInTheDocument();
    expect(screen.getByText('<script>unsafe()</script>')).toBeInTheDocument();
    expect(screen.getByText('return true;')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open screenshot' })).toHaveAttribute(
      'href',
      'https://example.com/proof.png',
    );
    expect(document.querySelector('script')).toBeNull();
  });

  it('shows attack path reasoning and genuine empty states', async () => {
    render(
      <FindingDetail
        issue={{
          ...issue,
          attackPath: {
            description: 'Public endpoint exposes private records',
            path: 'Public request → private records',
            likelihood: 'High',
            likelihoodRationale: 'No credentials needed',
            impact: 'High',
            impactRationale: 'Private records are disclosed',
            assumptions: ['Endpoint is reachable'],
            controls: ['Require authorization'],
            blindspots: ['Internal network not tested'],
          },
        }}
        onBack={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Attack path' }));
    expect(screen.getByText('Public request → private records')).toBeInTheDocument();
    expect(screen.getByText('Require authorization')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Evidence' }));
    expect(screen.getByText('No evidence recorded for this finding.')).toBeInTheDocument();
  });
});
