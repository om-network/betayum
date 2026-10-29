import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AppSidebar } from './AppSidebar';

vi.mock('@trycompai/design-system', () => ({
  AppShellNav: ({ children }: { children: ReactNode }) => <nav>{children}</nav>,
  AppShellNavItem: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

const common = {
  isQuestionnaireEnabled: false,
  hasAuditorRole: false,
  isOnlyAuditor: false,
  canAccessAuditorView: false,
};

describe('sidebar feature access', () => {
  it('shows Usage to read-only organization members without enabling paid products', () => {
    render(
      <AppSidebar
        {...common}
        organization={{ id: 'org_1', advancedModeEnabled: false }}
        permissions={{ organization: ['read'] }}
      />,
    );
    expect(screen.getByRole('link', { name: 'Usage' })).toHaveAttribute('href', '/org_1/usage');
    expect(screen.queryByRole('link', { name: 'Controls' })).not.toBeInTheDocument();
  });
  it('shows Controls only when advanced mode and control read permission are both present', () => {
    const { rerender } = render(
      <AppSidebar
        {...common}
        organization={{ id: 'org_1', advancedModeEnabled: true }}
        permissions={{ control: ['read'] }}
      />,
    );
    expect(screen.getByRole('link', { name: 'Controls' })).toHaveAttribute(
      'href',
      '/org_1/controls',
    );
    expect(screen.queryByRole('link', { name: 'Usage' })).not.toBeInTheDocument();
    rerender(
      <AppSidebar
        {...common}
        organization={{ id: 'org_1', advancedModeEnabled: true }}
        permissions={{}}
      />,
    );
    expect(screen.queryByRole('link', { name: 'Controls' })).not.toBeInTheDocument();
  });
});
