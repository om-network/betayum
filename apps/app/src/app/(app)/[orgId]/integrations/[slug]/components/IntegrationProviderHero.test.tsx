import type { ConnectionListItem, IntegrationProvider } from '@/hooks/use-integration-platform';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IntegrationProviderHero } from './IntegrationProviderHero';

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

vi.mock('@trycompai/design-system/icons', () => ({
  Add: () => null,
  Launch: () => null,
  Settings: () => null,
}));
vi.mock('next/image', () => ({ default: () => null }));
vi.mock('./AccountSelector', () => ({ AccountSelector: () => null }));

describe('IntegrationProviderHero permissions', () => {
  it('invokes Add account when updates are allowed', () => {
    const onAddAccount = vi.fn();
    render(
      <IntegrationProviderHero
        provider={provider}
        isConnected
        activeConnections={[connection]}
        selectedConnection={connection}
        onSelectConnection={vi.fn()}
        onOpenSettings={vi.fn()}
        onAddAccount={onAddAccount}
        canUpdate
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add another account' }));
    expect(onAddAccount).toHaveBeenCalledOnce();
  });

  it('disables Add account when updates are not allowed', () => {
    const onAddAccount = vi.fn();
    render(
      <IntegrationProviderHero
        provider={provider}
        isConnected
        activeConnections={[connection]}
        selectedConnection={connection}
        onSelectConnection={vi.fn()}
        onOpenSettings={vi.fn()}
        onAddAccount={onAddAccount}
        canUpdate={false}
      />,
    );
    expect(screen.getByRole('heading', { name: 'AWS' })).toBeInTheDocument();
    const addButton = screen.getByRole('button', { name: 'Add another account' });
    expect(addButton).toBeDisabled();
    fireEvent.click(addButton);
    expect(onAddAccount).not.toHaveBeenCalled();
  });
});
