const mockDb = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
};

jest.mock('@db', () => ({ db: mockDb }));

import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ClerkIdentityService } from './clerk-identity.service';

const baseUser = {
  id: 'usr_1',
  email: 'owner@trycomp.ai',
  emailVerified: true,
  name: 'Owner',
  image: null,
  role: 'user',
  clerkUserId: 'clerk_1',
};

describe('ClerkIdentityService', () => {
  let service: ClerkIdentityService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ClerkIdentityService();
  });

  it('resolves an existing user by Clerk user id', async () => {
    mockDb.user.findUnique.mockResolvedValueOnce(baseUser);

    await expect(
      service.resolveUser({
        clerkUserId: 'clerk_1',
        email: 'owner@trycomp.ai',
        emailVerified: true,
      }),
    ).resolves.toEqual({
      user: baseUser,
      source: 'clerk-user-id',
    });

    expect(mockDb.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clerkUserId: 'clerk_1' },
      }),
    );
    expect(mockDb.user.update).not.toHaveBeenCalled();
    expect(mockDb.user.create).not.toHaveBeenCalled();
  });

  it('resolves a mapped user for guard authentication', async () => {
    mockDb.user.findUnique.mockResolvedValueOnce(baseUser);

    await expect(service.resolveMappedUser('clerk_1')).resolves.toEqual(
      baseUser,
    );

    expect(mockDb.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clerkUserId: 'clerk_1' },
      }),
    );
  });

  it('rejects an unmapped Clerk user id', async () => {
    mockDb.user.findUnique.mockResolvedValueOnce(null);

    await expect(service.resolveMappedUser('clerk_missing')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('links an existing verified-email user without creating a duplicate', async () => {
    const unlinkedUser = { ...baseUser, clerkUserId: null };
    const linkedUser = { ...baseUser, clerkUserId: 'clerk_2' };
    mockDb.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(unlinkedUser);
    mockDb.user.update.mockResolvedValueOnce(linkedUser);

    await expect(
      service.resolveUser({
        clerkUserId: 'clerk_2',
        email: 'OWNER@TRYCOMP.AI',
        emailVerified: true,
      }),
    ).resolves.toEqual({
      user: linkedUser,
      source: 'verified-email-link',
    });

    expect(mockDb.user.findUnique).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { email: 'owner@trycomp.ai' },
      }),
    );
    expect(mockDb.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'usr_1' },
        data: { clerkUserId: 'clerk_2' },
      }),
    );
    expect(mockDb.user.create).not.toHaveBeenCalled();
  });

  it('creates a Comp AI user for a new verified Clerk user', async () => {
    const createdUser = {
      ...baseUser,
      id: 'usr_2',
      email: 'new@trycomp.ai',
      name: 'new',
      clerkUserId: 'clerk_new',
    };
    mockDb.user.findUnique.mockResolvedValue(null);
    mockDb.user.create.mockResolvedValueOnce(createdUser);

    await expect(
      service.resolveUser({
        clerkUserId: 'clerk_new',
        email: 'new@trycomp.ai',
        emailVerified: true,
      }),
    ).resolves.toEqual({
      user: createdUser,
      source: 'created-user',
    });

    expect(mockDb.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'new@trycomp.ai',
          emailVerified: true,
          clerkUserId: 'clerk_new',
          name: 'new',
        }),
      }),
    );
  });

  it('rejects unverified email identities before email linking', async () => {
    mockDb.user.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.resolveUser({
        clerkUserId: 'clerk_unverified',
        email: 'owner@trycomp.ai',
        emailVerified: false,
      }),
    ).rejects.toThrow(UnauthorizedException);

    expect(mockDb.user.findUnique).toHaveBeenCalledTimes(1);
    expect(mockDb.user.update).not.toHaveBeenCalled();
    expect(mockDb.user.create).not.toHaveBeenCalled();
  });

  it('rejects malformed Clerk identity input', async () => {
    await expect(
      service.resolveUser({
        clerkUserId: '',
        email: 'not-an-email',
        emailVerified: true,
      }),
    ).rejects.toThrow(UnauthorizedException);

    expect(mockDb.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects an email linked to another Clerk user', async () => {
    mockDb.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...baseUser, clerkUserId: 'clerk_existing' });

    await expect(
      service.resolveUser({
        clerkUserId: 'clerk_other',
        email: 'owner@trycomp.ai',
        emailVerified: true,
      }),
    ).rejects.toThrow(ConflictException);

    expect(mockDb.user.update).not.toHaveBeenCalled();
    expect(mockDb.user.create).not.toHaveBeenCalled();
  });
});
