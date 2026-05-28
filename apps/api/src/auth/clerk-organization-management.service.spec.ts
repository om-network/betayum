import { BadRequestException } from '@nestjs/common';
import { db } from '@db';
import { ClerkOrganizationManagementService } from './clerk-organization-management.service';

jest.mock('@db', () => ({
  db: {
    organization: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}));

const mockFetch = jest.fn();

describe('ClerkOrganizationManagementService', () => {
  let service: ClerkOrganizationManagementService;

  beforeEach(() => {
    service = new ClerkOrganizationManagementService();
    process.env.CLERK_SECRET_KEY = 'sk_test';
    process.env.CLERK_JWT_ISSUER = 'https://test.clerk.accounts.dev';
    process.env.CLERK_AUTHORIZED_PARTIES = 'http://localhost:3000';
    Object.defineProperty(globalThis, 'fetch', {
      value: mockFetch,
      writable: true,
    });
    jest.clearAllMocks();
    (db.organization.findUnique as jest.Mock).mockResolvedValue({
      clerkOrganizationId: 'org_clerk_1',
    });
    (db.user.findUnique as jest.Mock).mockResolvedValue({
      clerkUserId: 'user_clerk_inviter',
    });
  });

  afterEach(() => {
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.CLERK_JWT_ISSUER;
    delete process.env.CLERK_AUTHORIZED_PARTIES;
  });

  it('creates Clerk organization invitations with migrated role metadata', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            id: 'inv_clerk_1',
            email_address: 'auditor@example.com',
            role: 'org:auditor',
            status: 'pending',
            expires_at: 1_700_000_000_000,
            created_at: 1_699_999_000_000,
          }),
        ),
    });

    const invitation = await service.createInvitation({
      organizationId: 'org_1',
      email: 'auditor@example.com',
      roles: ['auditor'],
      inviterUserId: 'usr_inviter',
      redirectUrl: 'https://app.trycomp.ai/org_1',
    });

    expect(invitation).toEqual(
      expect.objectContaining({
        id: 'inv_clerk_1',
        email: 'auditor@example.com',
        role: 'org:auditor',
        status: 'pending',
      }),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.clerk.com/v1/organizations/org_clerk_1/invitations',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          email_address: 'auditor@example.com',
          role: 'org:auditor',
          redirect_url: 'https://app.trycomp.ai/org_1',
          inviter_user_id: 'user_clerk_inviter',
          public_metadata: {
            compAiOrganizationId: 'org_1',
            compAiRoles: ['auditor'],
          },
        }),
      }),
    );
  });

  it('lists pending invitations from Clerk using the local organization link', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            data: [
              {
                id: 'inv_clerk_1',
                email_address: 'pending@example.com',
                role: 'org:admin',
                status: 'pending',
                created_at: 1_699_999_000_000,
              },
            ],
          }),
        ),
    });

    const invitations = await service.listPendingInvitations('org_1');

    expect(invitations).toHaveLength(1);
    expect(invitations[0].email).toBe('pending@example.com');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.clerk.com/v1/organizations/org_clerk_1/invitations/pending?limit=100',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('revokes pending invitations in Clerk', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            id: 'inv_clerk_1',
            email_address: 'pending@example.com',
            role: 'org:admin',
            status: 'revoked',
          }),
        ),
    });

    await service.revokeInvitation({
      organizationId: 'org_1',
      invitationId: 'inv_clerk_1',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.clerk.com/v1/organizations/org_clerk_1/invitations/inv_clerk_1/revoke',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('updates and removes organization memberships by Clerk user id', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('{}'),
    });

    await service.updateMembershipRole({
      organizationId: 'org_1',
      clerkUserId: 'user_clerk_1',
      roles: ['admin'],
    });
    await service.removeMembership({
      organizationId: 'org_1',
      clerkUserId: 'user_clerk_1',
    });

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'https://api.clerk.com/v1/organizations/org_clerk_1/memberships/user_clerk_1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ role: 'org:admin' }),
      }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'https://api.clerk.com/v1/organizations/org_clerk_1/memberships/user_clerk_1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('rejects local organizations without a Clerk organization link', async () => {
    (db.organization.findUnique as jest.Mock).mockResolvedValueOnce({
      clerkOrganizationId: null,
    });

    await expect(service.listPendingInvitations('org_1')).rejects.toThrow(
      BadRequestException,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
