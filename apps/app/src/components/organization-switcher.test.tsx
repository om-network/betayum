import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrganizationSwitcher } from './organization-switcher';

const { mockPush, mockRefresh, mockSetActive } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockRefresh: vi.fn(),
  mockSetActive: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

vi.mock('@clerk/nextjs', () => ({
  useOrganizationList: () => ({
    isLoaded: true,
    setActive: mockSetActive,
  }),
}));

vi.mock('@trycompai/design-system', () => ({
  OrganizationSelector: ({
    organizations,
    onValueChange,
  }: {
    organizations: Array<{ id: string; name: string }>;
    onValueChange: (id: string) => void;
  }) => (
    <button type="button" onClick={() => onValueChange(organizations[1]?.id ?? '')}>
      Switch organization
    </button>
  ),
}));

const organizations = [
  {
    id: 'org_1',
    clerkOrganizationId: 'clerk_org_1',
    name: 'Current',
    logo: null,
    onboardingCompleted: true,
    hasAccess: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    memberRole: 'owner',
    memberId: 'mem_1',
  },
  {
    id: 'org_2',
    clerkOrganizationId: 'clerk_org_2',
    name: 'Next',
    logo: null,
    onboardingCompleted: true,
    hasAccess: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    memberRole: 'auditor',
    memberId: 'mem_2',
  },
];

describe('OrganizationSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetActive.mockResolvedValue(undefined);
  });

  it('updates Clerk active organization before navigating to the local org route', async () => {
    render(
      <OrganizationSwitcher
        organizations={organizations}
        organization={{ id: 'org_1', name: 'Current' }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Switch organization' }));

    await waitFor(() => {
      expect(mockSetActive).toHaveBeenCalledWith({
        organization: 'clerk_org_2',
      });
    });
    expect(mockPush).toHaveBeenCalledWith('/org_2/');
    expect(mockRefresh).toHaveBeenCalled();
  });
});
