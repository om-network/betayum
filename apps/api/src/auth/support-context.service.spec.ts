import { UnauthorizedException } from '@nestjs/common';
import { SupportContextService } from './support-context.service';

const mockFindFirst = jest.fn();
const mockParseSupportContext = jest.fn();

jest.mock('@db', () => ({
  db: {
    member: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
  },
}));

jest.mock('@trycompai/utils/support-context', () => ({
  SUPPORT_CONTEXT_COOKIE: 'comp_support_context',
  parseSupportContext: (...args: unknown[]) => mockParseSupportContext(...args),
}));

describe('SupportContextService', () => {
  const originalEnv = process.env;
  let service: SupportContextService;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      AUTH_SECRET: 'test-secret',
    };
    jest.clearAllMocks();
    service = new SupportContextService();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns null when the support context cookie is missing', async () => {
    await expect(
      service.resolve({
        actor: { id: 'usr_admin', role: 'admin' },
        cookieHeader: undefined,
      }),
    ).resolves.toBeNull();
  });

  it('rejects support context for non-admin actors', async () => {
    await expect(
      service.resolve({
        actor: { id: 'usr_regular', role: 'user' },
        cookieHeader: 'comp_support_context=value',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects actor mismatches', async () => {
    mockParseSupportContext.mockReturnValue({
      actorUserId: 'usr_other',
      organizationId: 'org_1',
      targetUserId: 'usr_target',
      expiresAt: Date.now() + 10_000,
    });

    await expect(
      service.resolve({
        actor: { id: 'usr_admin', role: 'admin' },
        cookieHeader: 'comp_support_context=value',
      }),
    ).rejects.toThrow('Support context actor does not match');
  });

  it('rejects cross-organization requests', async () => {
    mockParseSupportContext.mockReturnValue({
      actorUserId: 'usr_admin',
      organizationId: 'org_1',
      targetUserId: 'usr_target',
      expiresAt: Date.now() + 10_000,
    });

    await expect(
      service.resolve({
        actor: { id: 'usr_admin', role: 'admin' },
        cookieHeader: 'comp_support_context=value',
        requestedOrganizationId: 'org_2',
      }),
    ).rejects.toThrow('Support context cannot cross organization boundaries');
  });

  it('returns target user membership context for valid support context', async () => {
    mockParseSupportContext.mockReturnValue({
      actorUserId: 'usr_admin',
      organizationId: 'org_1',
      targetUserId: 'usr_target',
      expiresAt: Date.now() + 10_000,
    });
    mockFindFirst.mockResolvedValue({
      id: 'mem_1',
      role: 'auditor,employee',
      department: 'none',
      user: {
        id: 'usr_target',
        email: 'target@example.com',
      },
    });

    await expect(
      service.resolve({
        actor: { id: 'usr_admin', role: 'admin' },
        cookieHeader: 'comp_support_context=value',
        requestedOrganizationId: 'org_1',
      }),
    ).resolves.toEqual({
      memberId: 'mem_1',
      memberDepartment: 'none',
      organizationId: 'org_1',
      targetUserId: 'usr_target',
      targetUserEmail: 'target@example.com',
      targetUserRoles: ['auditor', 'employee'],
      impersonatedBy: 'usr_admin',
    });
  });
});
