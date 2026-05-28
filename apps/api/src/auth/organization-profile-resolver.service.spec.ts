const mockDb = {
  organization: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('@db', () => ({ db: mockDb }));

import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { OrganizationProfileResolverService } from './organization-profile-resolver.service';

const linkedOrganization = {
  id: 'org_1',
  clerkOrganizationId: 'clerk_org_1',
  name: 'Acme',
  slug: 'acme',
};

function prismaError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

describe('OrganizationProfileResolverService', () => {
  let service: OrganizationProfileResolverService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OrganizationProfileResolverService();
  });

  it('resolves a local organization profile by Clerk organization id', async () => {
    mockDb.organization.findUnique.mockResolvedValueOnce(linkedOrganization);

    await expect(
      service.resolveByClerkOrganizationId({
        clerkOrganizationId: ' clerk_org_1 ',
      }),
    ).resolves.toEqual(linkedOrganization);

    expect(mockDb.organization.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clerkOrganizationId: 'clerk_org_1' },
      }),
    );
  });

  it('rejects a required Clerk organization when no local link exists', async () => {
    mockDb.organization.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.requireByClerkOrganizationId({
        clerkOrganizationId: 'clerk_org_missing',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('links an existing local organization to a Clerk organization id', async () => {
    mockDb.organization.update.mockResolvedValueOnce(linkedOrganization);

    await expect(
      service.linkClerkOrganization({
        organizationId: ' org_1 ',
        clerkOrganizationId: ' clerk_org_1 ',
      }),
    ).resolves.toEqual(linkedOrganization);

    expect(mockDb.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'org_1' },
        data: { clerkOrganizationId: 'clerk_org_1' },
      }),
    );
  });

  it('prevents linking the same Clerk organization id twice', async () => {
    mockDb.organization.update.mockRejectedValueOnce(prismaError('P2002'));

    await expect(
      service.linkClerkOrganization({
        organizationId: 'org_2',
        clerkOrganizationId: 'clerk_org_1',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('reports missing local organizations during linking', async () => {
    mockDb.organization.update.mockRejectedValueOnce(prismaError('P2025'));

    await expect(
      service.linkClerkOrganization({
        organizationId: 'org_missing',
        clerkOrganizationId: 'clerk_org_1',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('keeps local organization id resolution available for API key and service-token scopes', async () => {
    mockDb.organization.findUnique.mockResolvedValueOnce(linkedOrganization);

    await expect(
      service.requireByLocalOrganizationId({ organizationId: ' org_1 ' }),
    ).resolves.toEqual(linkedOrganization);

    expect(mockDb.organization.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'org_1' },
      }),
    );
  });

  it('rejects blank organization identifiers before querying', async () => {
    await expect(
      service.resolveByClerkOrganizationId({ clerkOrganizationId: ' ' }),
    ).rejects.toThrow(UnauthorizedException);
    await expect(
      service.requireByLocalOrganizationId({ organizationId: '' }),
    ).rejects.toThrow(UnauthorizedException);

    expect(mockDb.organization.findUnique).not.toHaveBeenCalled();
  });
});
