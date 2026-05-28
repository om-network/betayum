const mockDb = {
  member: {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

jest.mock('@db', () => ({
  Departments: { none: 'none' },
  db: mockDb,
}));

import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { MemberProfileResolverService } from './member-profile-resolver.service';

const linkedProfile = {
  id: 'mem_1',
  organizationId: 'org_1',
  userId: 'usr_1',
  clerkUserId: 'clerk_user_1',
  clerkOrganizationId: 'clerk_org_1',
  clerkMembershipId: 'clerk_mem_1',
  role: 'employee',
  department: 'none',
  isActive: true,
  deactivated: false,
};

function prismaError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

describe('MemberProfileResolverService', () => {
  let service: MemberProfileResolverService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MemberProfileResolverService();
  });

  it('resolves a local member profile by Clerk membership id', async () => {
    mockDb.member.findUnique.mockResolvedValueOnce(linkedProfile);

    await expect(
      service.resolveByClerkMembershipId({
        clerkMembershipId: ' clerk_mem_1 ',
      }),
    ).resolves.toEqual(linkedProfile);

    expect(mockDb.member.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clerkMembershipId: 'clerk_mem_1' },
      }),
    );
  });

  it('returns a retained profile without a current Clerk membership id', async () => {
    const retainedProfile = { ...linkedProfile, clerkMembershipId: null };
    mockDb.member.findUnique.mockResolvedValueOnce(retainedProfile);

    await expect(
      service.resolveByClerkUserAndOrganization({
        clerkUserId: 'clerk_user_1',
        clerkOrganizationId: 'clerk_org_1',
      }),
    ).resolves.toEqual(retainedProfile);
  });

  it('returns null when a Clerk membership has no local profile yet', async () => {
    mockDb.member.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.resolveByClerkMembershipId({
        clerkMembershipId: 'clerk_mem_missing',
      }),
    ).resolves.toBeNull();
  });

  it('links an existing member profile to Clerk membership identifiers', async () => {
    mockDb.member.update.mockResolvedValueOnce(linkedProfile);

    await expect(
      service.linkClerkMembership({
        memberId: ' mem_1 ',
        clerkUserId: ' clerk_user_1 ',
        clerkOrganizationId: ' clerk_org_1 ',
        clerkMembershipId: ' clerk_mem_1 ',
      }),
    ).resolves.toEqual(linkedProfile);

    expect(mockDb.member.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'mem_1' },
        data: {
          clerkUserId: 'clerk_user_1',
          clerkOrganizationId: 'clerk_org_1',
          clerkMembershipId: 'clerk_mem_1',
        },
      }),
    );
  });

  it('prevents duplicate Clerk membership profile links', async () => {
    mockDb.member.update.mockRejectedValueOnce(prismaError('P2002'));

    await expect(
      service.linkClerkMembership({
        memberId: 'mem_2',
        clerkUserId: 'clerk_user_1',
        clerkOrganizationId: 'clerk_org_1',
        clerkMembershipId: 'clerk_mem_1',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('reports missing member profiles during linking', async () => {
    mockDb.member.update.mockRejectedValueOnce(prismaError('P2025'));

    await expect(
      service.linkClerkMembership({
        memberId: 'mem_missing',
        clerkUserId: 'clerk_user_1',
        clerkOrganizationId: 'clerk_org_1',
        clerkMembershipId: 'clerk_mem_1',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('removes only the current Clerk membership link while retaining historical profile data', async () => {
    mockDb.member.updateMany.mockResolvedValueOnce({ count: 1 });

    await expect(
      service.unlinkClerkMembership({ clerkMembershipId: ' clerk_mem_1 ' }),
    ).resolves.toBe(true);

    expect(mockDb.member.updateMany).toHaveBeenCalledWith({
      where: { clerkMembershipId: 'clerk_mem_1' },
      data: { clerkMembershipId: null },
    });
  });

  it('rejects blank Clerk identifiers before querying', async () => {
    await expect(
      service.resolveByClerkUserAndOrganization({
        clerkUserId: '',
        clerkOrganizationId: 'clerk_org_1',
      }),
    ).rejects.toThrow(UnauthorizedException);

    expect(mockDb.member.findUnique).not.toHaveBeenCalled();
  });
});
