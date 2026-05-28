import { render, screen } from '@testing-library/react';
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  ReactNode,
} from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  setMockPermissions,
  ADMIN_PERMISSIONS,
  AUDITOR_PERMISSIONS,
  mockHasPermission,
} from '@/test-utils/mocks/permissions';
import type { FrameworkInstanceWithControls } from '@/lib/types/framework';

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    permissions: {},
    hasPermission: mockHasPermission,
  }),
}));

vi.mock('./AddFrameworkModal', () => ({
  AddFrameworkModal: () => <div data-testid="add-framework-modal" />,
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ orgId: 'org_123' }),
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={props.alt as string} src={props.src as string} />
  ),
}));

type MockLayoutProps = {
  children?: ReactNode;
  style?: CSSProperties;
};

vi.mock('@trycompai/design-system', () => ({
  Button: ({
    children,
    ...props
  }: { children?: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  Card: ({ children, style }: MockLayoutProps) => <div style={style}>{children}</div>,
  CardContent: ({ children, style }: MockLayoutProps) => <div style={style}>{children}</div>,
  CardFooter: ({ children, style }: MockLayoutProps) => <div style={style}>{children}</div>,
  CardHeader: ({ children }: MockLayoutProps) => <div>{children}</div>,
  CardTitle: ({ children }: MockLayoutProps) => <div>{children}</div>,
  Dialog: ({ children }: MockLayoutProps) => <div>{children}</div>,
  ScrollArea: ({ children }: MockLayoutProps) => <div>{children}</div>,
}));

vi.mock('@trycompai/design-system/icons', () => ({
  Add: () => <span data-testid="add-icon" />,
}));

import { FrameworksOverview } from './FrameworksOverview';

const baseProps = {
  frameworksWithControls: [],
  allFrameworks: [],
  frameworksWithCompliance: [],
  organizationId: 'org_123',
  overallComplianceScore: 0,
};

function makeFrameworkInstance({
  id,
  frameworkId,
  name,
  description,
}: {
  id: string;
  frameworkId: string;
  name: string;
  description: string;
}): FrameworkInstanceWithControls {
  return {
    id,
    organizationId: 'org_123',
    frameworkId,
    customFrameworkId: null,
    currentVersionId: null,
    customFramework: null,
    controls: [],
    framework: {
      id: frameworkId,
      name,
      description,
      version: '1.0.0',
      visible: true,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    },
  };
}

describe('FrameworksOverview permission gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows "Add Framework" button when user has framework:create permission', () => {
    setMockPermissions(ADMIN_PERMISSIONS);
    render(<FrameworksOverview {...baseProps} />);
    expect(screen.getByRole('button', { name: /add framework/i })).toBeInTheDocument();
  });

  it('hides "Add Framework" button when user lacks framework:create permission', () => {
    setMockPermissions(AUDITOR_PERMISSIONS);
    render(<FrameworksOverview {...baseProps} />);
    expect(screen.queryByRole('button', { name: /add framework/i })).not.toBeInTheDocument();
  });

  it('hides "Add Framework" button when user has no permissions', () => {
    setMockPermissions({});
    render(<FrameworksOverview {...baseProps} />);
    expect(screen.queryByRole('button', { name: /add framework/i })).not.toBeInTheDocument();
  });

  it('renders PCI DSS badge for PCI DSS Level 1 framework instances', () => {
    setMockPermissions({});

    render(
      <FrameworksOverview
        {...baseProps}
        overallComplianceScore={0}
        frameworksWithControls={[
          makeFrameworkInstance({
            id: 'fi_pci_level_1',
            frameworkId: 'fw_pci_level_1',
            name: 'PCI DSS Level 1',
            description: 'Payment Card Industry Data Security Standard Level 1',
          }),
        ]}
      />,
    );

    const badge = screen.getByAltText('PCI DSS Level 1');
    expect(badge).toHaveAttribute('src', '/badges/pci-dss.svg');
  });

  it('renders PCI DSS badge for PCI DSS framework name variants', () => {
    setMockPermissions({});

    render(
      <FrameworksOverview
        {...baseProps}
        overallComplianceScore={0}
        frameworksWithControls={[
          makeFrameworkInstance({
            id: 'fi_pci_variant',
            frameworkId: 'fw_pci_variant',
            name: 'PCI DSS v4.0 Level 1',
            description: 'PCI DSS framework variant',
          }),
        ]}
      />,
    );

    const badge = screen.getByAltText('PCI DSS v4.0 Level 1');
    expect(badge).toHaveAttribute('src', '/badges/pci-dss.svg');
  });
});
