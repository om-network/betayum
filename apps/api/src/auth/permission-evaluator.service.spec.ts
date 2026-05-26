const mockFindMany = jest.fn();

jest.mock('@db', () => ({
  db: {
    organizationRole: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

jest.mock('@trycompai/auth', () => ({
  BUILT_IN_ROLE_PERMISSIONS: {
    owner: {
      organization: ['read', 'update', 'delete'],
      control: ['create', 'read', 'update', 'delete'],
    },
    admin: {
      control: ['create', 'read', 'update', 'delete'],
      risk: ['read', 'update'],
    },
    auditor: {
      control: ['read'],
      evidence: ['read'],
      finding: ['create', 'read', 'update', 'delete'],
    },
    employee: {
      policy: ['read'],
      portal: ['read', 'update'],
    },
    contractor: {
      policy: ['read'],
      portal: ['read', 'update'],
    },
  },
  parseRolePermissions: (value: unknown) => {
    try {
      if (!value) return null;
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : null;
    } catch {
      return null;
    }
  },
}));

import { PermissionEvaluatorService } from './permission-evaluator.service';

describe('PermissionEvaluatorService', () => {
  let service: PermissionEvaluatorService;

  beforeEach(() => {
    service = new PermissionEvaluatorService();
    mockFindMany.mockReset();
    mockFindMany.mockResolvedValue([]);
  });

  it('allows permissions granted by a built-in role', async () => {
    await expect(
      service.hasPermissions({
        organizationId: 'org_123',
        roles: ['admin'],
        permissions: { control: ['delete'] },
      }),
    ).resolves.toBe(true);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('evaluates owner and contractor built-in roles from the shared map', async () => {
    await expect(
      service.hasPermissions({
        organizationId: 'org_123',
        roles: ['owner'],
        permissions: { organization: ['delete'] },
      }),
    ).resolves.toBe(true);

    await expect(
      service.hasPermissions({
        organizationId: 'org_123',
        roles: ['contractor'],
        permissions: { portal: ['update'] },
      }),
    ).resolves.toBe(true);
  });

  it('denies actions not granted by a built-in role', async () => {
    await expect(
      service.hasPermissions({
        organizationId: 'org_123',
        roles: ['auditor'],
        permissions: { control: ['delete'] },
      }),
    ).resolves.toBe(false);
  });

  it('unions permissions across multiple comma-separated roles', async () => {
    await expect(
      service.hasPermissions({
        organizationId: 'org_123',
        roles: ['auditor, employee'],
        permissions: { finding: ['update'], portal: ['update'] },
      }),
    ).resolves.toBe(true);
  });

  it('loads organization custom roles from the database', async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        name: 'security-lead',
        permissions: JSON.stringify({ pentest: ['read', 'delete'] }),
      },
    ]);

    await expect(
      service.hasPermissions({
        organizationId: 'org_123',
        roles: ['security-lead'],
        permissions: { pentest: ['delete'] },
      }),
    ).resolves.toBe(true);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { organizationId: 'org_123', name: { in: ['security-lead'] } },
      select: { name: true, permissions: true },
    });
  });

  it('ignores invalid custom role permissions', async () => {
    mockFindMany.mockResolvedValueOnce([
      { name: 'broken-role', permissions: '{not-json' },
    ]);

    await expect(
      service.hasPermissions({
        organizationId: 'org_123',
        roles: ['broken-role'],
        permissions: { control: ['read'] },
      }),
    ).resolves.toBe(false);
  });

  it('requires all requested resource actions', async () => {
    await expect(
      service.hasPermissions({
        organizationId: 'org_123',
        roles: ['admin'],
        permissions: { control: ['read', 'delete'], risk: ['update'] },
      }),
    ).resolves.toBe(true);

    await expect(
      service.hasPermissions({
        organizationId: 'org_123',
        roles: ['admin'],
        permissions: { control: ['read'], pentest: ['read'] },
      }),
    ).resolves.toBe(false);
  });

  it('denies empty or missing roles', async () => {
    await expect(
      service.hasPermissions({
        organizationId: 'org_123',
        roles: null,
        permissions: { control: ['read'] },
      }),
    ).resolves.toBe(false);

    await expect(
      service.hasPermissions({
        organizationId: 'org_123',
        roles: ['  '],
        permissions: { control: ['read'] },
      }),
    ).resolves.toBe(false);
  });
});
