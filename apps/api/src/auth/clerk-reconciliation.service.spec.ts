import { db } from '@db';
import { ClerkOrganizationManagementService } from './clerk-organization-management.service';
import { ClerkReconciliationService } from './clerk-reconciliation.service';

jest.mock('@db', () => ({
  db: {
    organization: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    member: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

describe('ClerkReconciliationService', () => {
  const clerkOrganizations = {
    listMemberships: jest.fn(),
  } as unknown as jest.Mocked<ClerkOrganizationManagementService>;

  let service: ClerkReconciliationService;

  beforeEach(() => {
    service = new ClerkReconciliationService(clerkOrganizations);
    jest.clearAllMocks();
  });

  it('handles membership created webhooks idempotently', async () => {
    (db.organization.findUnique as jest.Mock).mockResolvedValue({
      id: 'org_1',
    });
    (db.user.findUnique as jest.Mock).mockResolvedValue({ id: 'usr_1' });
    (db.member.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'mem_1' });

    const event = membershipEvent('organizationMembership.created');

    await expect(service.handleWebhookEvent(event)).resolves.toEqual({
      handled: true,
      issues: [],
    });
    await expect(service.handleWebhookEvent(event)).resolves.toEqual({
      handled: true,
      issues: [],
    });

    expect(db.member.create).toHaveBeenCalledTimes(1);
    expect(db.member.update).toHaveBeenCalledTimes(1);
    expect(db.member.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org_1',
        userId: 'usr_1',
        clerkMembershipId: 'mem_clerk_1',
        clerkUserId: 'user_clerk_1',
        clerkOrganizationId: 'org_clerk_1',
        role: 'admin',
        deactivated: false,
        isActive: true,
      }),
    });
  });

  it('reports out-of-order membership delivery when local organization is missing', async () => {
    (db.organization.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      service.handleWebhookEvent(
        membershipEvent('organizationMembership.created'),
      ),
    ).resolves.toEqual({
      handled: true,
      issues: ['missing-local-organization:org_clerk_1'],
    });
    expect(db.member.create).not.toHaveBeenCalled();
  });

  it('reports missing local user mappings without creating member profiles', async () => {
    (db.organization.findUnique as jest.Mock).mockResolvedValue({
      id: 'org_1',
    });
    (db.user.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      service.handleWebhookEvent(
        membershipEvent('organizationMembership.updated'),
      ),
    ).resolves.toEqual({
      handled: true,
      issues: ['missing-local-user:user_clerk_1'],
    });
    expect(db.member.create).not.toHaveBeenCalled();
  });

  it('deactivates local profiles when Clerk membership is removed', async () => {
    (db.member.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    await expect(
      service.handleWebhookEvent(
        membershipEvent('organizationMembership.deleted'),
      ),
    ).resolves.toEqual({ handled: true, issues: [] });

    expect(db.member.updateMany).toHaveBeenCalledWith({
      where: {
        clerkOrganizationId: 'org_clerk_1',
        clerkUserId: 'user_clerk_1',
        deactivated: false,
      },
      data: expect.objectContaining({
        isActive: false,
        deactivated: true,
        clerkMembershipId: null,
        offboardDate: expect.any(Date),
      }),
    });
  });

  it('reports role mismatch, invitation drift, and unmapped permissions', async () => {
    (db.organization.findUnique as jest.Mock).mockResolvedValue({
      id: 'org_1',
      clerkOrganizationId: 'org_clerk_1',
      members: [
        {
          id: 'mem_1',
          role: 'admin',
          clerkUserId: 'user_clerk_1',
          clerkOrganizationId: 'org_clerk_1',
          clerkMembershipId: 'mem_clerk_1',
          deactivated: false,
        },
        {
          id: 'mem_orphan',
          role: 'auditor',
          clerkUserId: 'user_clerk_orphan',
          clerkOrganizationId: 'org_clerk_1',
          clerkMembershipId: 'mem_orphan',
          deactivated: false,
        },
      ],
      invitations: [{ id: 'inv_legacy', email: 'old@example.com' }],
      organizationRoles: [
        {
          name: 'custom',
          permissions: JSON.stringify({ unknown: ['read'] }),
        },
      ],
    });
    clerkOrganizations.listMemberships.mockResolvedValue([
      {
        id: 'mem_clerk_1',
        clerkUserId: 'user_clerk_1',
        email: 'user@example.com',
        role: 'org:auditor',
      },
      {
        id: 'mem_clerk_missing',
        clerkUserId: 'user_clerk_missing',
        email: 'missing@example.com',
        role: 'org:admin',
      },
    ]);

    const report = await service.reconcileOrganization('org_1');

    expect(report.roleMismatches).toEqual([
      {
        memberId: 'mem_1',
        clerkUserId: 'user_clerk_1',
        localRole: 'org:admin',
        clerkRole: 'org:auditor',
      },
    ]);
    expect(report.missingLocalLinks).toContain(
      'member:user_clerk_missing:mem_clerk_missing',
    );
    expect(report.orphanedLocalProfiles).toContain('member:mem_orphan');
    expect(report.invitationDrift).toEqual(['inv_legacy:old@example.com']);
    expect(report.unmappedPermissions).toEqual(['custom:unknown:read']);
  });
});

function membershipEvent(type: string) {
  return {
    type,
    data: {
      id: 'mem_clerk_1',
      role: 'org:admin',
      organization: { id: 'org_clerk_1' },
      public_user_data: {
        user_id: 'user_clerk_1',
        identifier: 'user@example.com',
      },
    },
  };
}
