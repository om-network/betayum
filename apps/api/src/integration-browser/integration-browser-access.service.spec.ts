class MockPrismaError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

const mockDb = {
  browserViewerSession: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    updateMany: jest.fn(),
  },
  codexTerminalSession: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    updateMany: jest.fn(),
  },
  integrationConnection: {
    findFirst: jest.fn(),
  },
};

jest.mock('@db', () => ({
  BrowserViewerSessionStatus: {
    provisioning: 'provisioning',
    ready: 'ready',
    active: 'active',
    expired: 'expired',
  },
  CodexTerminalSessionStatus: {
    provisioning: 'provisioning',
    ready: 'ready',
    active: 'active',
    expired: 'expired',
  },
  Prisma: {
    PrismaClientKnownRequestError: MockPrismaError,
  },
  db: mockDb,
}));

import { IntegrationBrowserAccessService } from './integration-browser-access.service';

describe(IntegrationBrowserAccessService.name, () => {
  const service = new IntegrationBrowserAccessService();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows an active GitHub connection to use the organization browser', async () => {
    mockDb.integrationConnection.findFirst.mockResolvedValue({
      id: 'icn_github',
    });

    await expect(
      service.requireBrowserConnection({
        connectionId: 'icn_github',
        organizationId: 'org_1',
      }),
    ).resolves.toBeUndefined();
    expect(mockDb.integrationConnection.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'icn_github',
        organizationId: 'org_1',
        status: 'active',
        provider: { slug: { in: ['gcp', 'github'] } },
      },
      select: { id: true },
    });
  });

  it('claims the organization lease when no viewer is active', async () => {
    mockDb.browserViewerSession.findUnique.mockResolvedValue(null);
    mockDb.browserViewerSession.create.mockResolvedValue({ id: 'bvs_1' });

    await expect(
      service.claimViewerSession({
        browserVmId: 'bvm_1',
        connectionId: 'icn_1',
        organizationId: 'org_1',
        userId: 'usr_1',
        expiresAt: new Date('2026-07-29T04:00:00.000Z'),
      }),
    ).resolves.toEqual({
      claimed: true,
      session: { id: 'bvs_1' },
    });
    expect(mockDb.browserViewerSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ leaseKey: 'org_1' }),
    });
  });

  it('returns the winning viewer after a concurrent unique lease conflict', async () => {
    mockDb.browserViewerSession.findUnique.mockResolvedValue(null);
    mockDb.browserViewerSession.create.mockRejectedValue(
      new MockPrismaError('P2002'),
    );
    mockDb.browserViewerSession.findUniqueOrThrow.mockResolvedValue({
      id: 'bvs_winner',
    });

    await expect(
      service.claimViewerSession({
        browserVmId: 'bvm_1',
        connectionId: 'icn_1',
        organizationId: 'org_1',
        userId: 'usr_1',
        expiresAt: new Date('2026-07-29T04:00:00.000Z'),
      }),
    ).resolves.toEqual({
      claimed: false,
      session: { id: 'bvs_winner' },
    });
  });
});
