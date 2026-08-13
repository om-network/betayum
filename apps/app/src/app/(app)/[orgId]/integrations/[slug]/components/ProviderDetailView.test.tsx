import type { ConnectionListItem, IntegrationProvider } from '@/hooks/use-integration-platform';
import {
  ADMIN_PERMISSIONS,
  AUDITOR_PERMISSIONS,
  mockHasPermission,
  setMockPermissions,
} from '@/test-utils/mocks/permissions';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderDetailView } from './ProviderDetailView';

const { startOAuth, updateServices, mockApiPost } = vi.hoisted(() => ({
  startOAuth: vi.fn(),
  updateServices: vi.fn(),
  mockApiPost: vi.fn(),
}));
const provider: IntegrationProvider = {
  id: 'aws',
  slug: 'aws',
  name: 'AWS',
  description: 'Cloud provider',
  category: 'Cloud',
  logoUrl: '',
  authType: 'custom',
  capabilities: ['checks'],
  isActive: true,
  services: [{ id: 'securityhub', name: 'Security Hub', description: 'Findings' }],
};
const connection: ConnectionListItem = {
  id: 'conn_1',
  providerId: 'aws',
  providerSlug: 'aws',
  providerName: 'AWS',
  status: 'active',
  authStrategy: 'custom',
  lastSyncAt: null,
  nextSyncAt: null,
  errorMessage: null,
  variables: null,
  metadata: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

vi.mock('@/test-utils/mocks/permissions', async () => {
  const actual = await vi.importActual<typeof import('@/test-utils/mocks/permissions')>(
    '@/test-utils/mocks/permissions',
  );
  return actual;
});
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ hasPermission: mockHasPermission }),
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ orgId: 'org_1' }),
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/api-client', () => ({ api: { post: mockApiPost } }));
vi.mock('@/hooks/use-integration-platform', () => ({
  useIntegrationConnections: () => ({ connections: [connection], refresh: vi.fn() }),
  useIntegrationMutations: () => ({ startOAuth }),
  useConnectionServices: () => ({
    services: [{ id: 'securityhub', enabled: true }],
    meta: { detectionReady: true },
    refresh: vi.fn(),
    updateServices,
  }),
}));
vi.mock('./IntegrationProviderHero', () => ({
  IntegrationProviderHero: ({
    canUpdate,
    onAddAccount,
  }: {
    canUpdate: boolean;
    onAddAccount: () => void;
  }) => (
    <button disabled={!canUpdate} onClick={onAddAccount}>
      Add account
    </button>
  ),
}));
vi.mock('./IntegrationEvidenceTasks', () => ({ IntegrationEvidenceTasks: () => <div /> }));
vi.mock('./AccountSettingsSheet', () => ({ AccountSettingsSheet: () => null }));
vi.mock('./EmptyStateOnboarding', () => ({ EmptyStateOnboarding: () => null }));
vi.mock('./GcpBrowserLogin', () => ({ BrowserLogin: () => null }));
vi.mock('./GcpProjectPicker', () => ({ GcpProjectPicker: () => null }));
vi.mock('./services-grid', () => ({
  ServicesGrid: ({
    onToggle,
  }: {
    onToggle: (id: string, enabled: boolean) => Promise<boolean>;
  }) => <button onClick={() => void onToggle('securityhub', false)}>Toggle service</button>,
}));
vi.mock('@/components/integrations/ConnectIntegrationDialog', () => ({
  ConnectIntegrationDialog: () => null,
}));
vi.mock('@trycompai/design-system', () => ({
  Breadcrumb: () => null,
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));
vi.mock('next/link', () => ({
  default: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

describe('ProviderDetailView permissions', () => {
  beforeEach(() => {
    setMockPermissions(ADMIN_PERMISSIONS);
    vi.clearAllMocks();
    mockApiPost.mockResolvedValue({ data: { services: [] } });
  });

  it('allows admin mutation controls to invoke service updates', async () => {
    render(
      <ProviderDetailView
        provider={provider}
        initialConnections={[connection]}
        taskTemplates={[]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Toggle service' }));
    await waitFor(() => expect(updateServices).toHaveBeenCalledWith('securityhub', false));
  });

  it('keeps connection data visible but blocks auditor mutations', () => {
    setMockPermissions(AUDITOR_PERMISSIONS);
    render(
      <ProviderDetailView
        provider={provider}
        initialConnections={[connection]}
        taskTemplates={[]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Add account' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Toggle service' }));
    expect(updateServices).not.toHaveBeenCalled();
    expect(screen.getByText('Services')).toBeInTheDocument();
  });
});
