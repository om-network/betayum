import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

// Mock @db before importing the guard so the Prisma client doesn't try to
// initialize against a real DATABASE_URL in this unit-test env.
jest.mock('@db', () => ({
  db: {
    organizationRole: {
      findMany: jest.fn(),
    },
  },
  CommentEntityType: {
    task: 'task',
    vendor: 'vendor',
    risk: 'risk',
    policy: 'policy',
    finding: 'finding',
  },
}));

jest.mock('@trycompai/auth', () => ({
  BUILT_IN_ROLE_PERMISSIONS: {},
  parseRolePermissions: jest.fn(),
}));

// Mock the permission.guard module so we don't pull the full auth guard chain
// (the guard only borrows the PERMISSIONS_KEY constant + RequiredPermission
// type — both safe to redefine here).
jest.mock('../auth/permission.guard', () => ({
  PERMISSIONS_KEY: 'permissions',
}));

const resolveServiceByNameMock = jest.fn();
jest.mock('../auth/service-token.config', () => ({
  resolveServiceByName: (...args: unknown[]) =>
    resolveServiceByNameMock(...args),
}));

import { PermissionEvaluatorService } from '../auth/permission-evaluator.service';
import { CommentsPermissionGuard } from './comments-permission.guard';

type MockRequest = {
  method: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  headers: Record<string, string>;
  organizationId?: string;
  userRoles?: string[] | null;
  isApiKey?: boolean;
  isServiceToken?: boolean;
  isPlatformAdmin?: boolean;
};

function makeContext(request: MockRequest): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

const hasPermissionsMock = jest.fn();
const permissionEvaluator = {
  hasPermissions: (...args: unknown[]) => hasPermissionsMock(...args),
} as unknown as PermissionEvaluatorService;

function reflectorWith(resource: string, action: string): Reflector {
  const reflector = new Reflector();
  jest
    .spyOn(reflector, 'getAllAndOverride')
    .mockReturnValue([{ resource, actions: [action] }]);
  return reflector;
}

function createGuard(
  resource: string,
  action: string,
): CommentsPermissionGuard {
  return new CommentsPermissionGuard(
    reflectorWith(resource, action),
    permissionEvaluator,
  );
}

describe('CommentsPermissionGuard', () => {
  beforeEach(() => {
    hasPermissionsMock.mockReset();
  });

  it('resolves entityType from POST body and checks finding:update when finding', async () => {
    hasPermissionsMock.mockResolvedValueOnce(true);
    const guard = createGuard('task', 'update');
    const context = makeContext({
      method: 'POST',
      body: { entityType: 'finding' },
      headers: { cookie: 'session=abc' },
      organizationId: 'org_123',
      userRoles: ['auditor'],
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(hasPermissionsMock).toHaveBeenCalledWith({
      organizationId: 'org_123',
      roles: ['auditor'],
      permissions: { finding: ['update'] },
    });
  });

  it('resolves entityType from GET query and checks finding:read when finding', async () => {
    hasPermissionsMock.mockResolvedValueOnce(true);
    const guard = createGuard('task', 'read');
    const context = makeContext({
      method: 'GET',
      query: { entityType: 'finding' },
      headers: { cookie: 'session=abc' },
      organizationId: 'org_123',
      userRoles: ['auditor'],
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(hasPermissionsMock).toHaveBeenCalledWith({
      organizationId: 'org_123',
      roles: ['auditor'],
      permissions: { finding: ['read'] },
    });
  });

  it('falls back to the metadata resource when entityType is missing (PUT)', async () => {
    hasPermissionsMock.mockResolvedValueOnce(true);
    const guard = createGuard('task', 'update');
    const context = makeContext({
      method: 'PUT',
      body: { content: 'edit' },
      headers: { cookie: 'session=abc' },
      organizationId: 'org_123',
      userRoles: ['admin'],
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(hasPermissionsMock).toHaveBeenCalledWith({
      organizationId: 'org_123',
      roles: ['admin'],
      permissions: { task: ['update'] },
    });
  });

  it('falls back to the metadata resource for unknown entityType values', async () => {
    hasPermissionsMock.mockResolvedValueOnce(true);
    const guard = createGuard('task', 'update');
    const context = makeContext({
      method: 'POST',
      body: { entityType: 'not-an-entity' },
      headers: { cookie: 'session=abc' },
      organizationId: 'org_123',
      userRoles: ['admin'],
    });
    await guard.canActivate(context);
    expect(hasPermissionsMock).toHaveBeenCalledWith({
      organizationId: 'org_123',
      roles: ['admin'],
      permissions: { task: ['update'] },
    });
  });

  it('throws ForbiddenException when permission evaluation rejects', async () => {
    hasPermissionsMock.mockResolvedValueOnce(false);
    const guard = createGuard('task', 'update');
    const context = makeContext({
      method: 'POST',
      body: { entityType: 'finding' },
      headers: { cookie: 'session=abc' },
      organizationId: 'org_123',
      userRoles: ['employee'],
    });
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('allows API keys whose scopes include the resolved permission', async () => {
    const guard = createGuard('task', 'update');
    const context = makeContext({
      method: 'POST',
      body: { entityType: 'finding' },
      headers: {},
      isApiKey: true,
    });
    // Inject explicit scope set on the request — entityType=finding requires
    // `finding:update`, NOT `task:update`.
    (
      context.switchToHttp().getRequest() as { apiKeyScopes: string[] }
    ).apiKeyScopes = ['finding:update'];
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(hasPermissionsMock).not.toHaveBeenCalled();
  });

  it('rejects API keys whose scopes do not include the resolved permission (no bypass)', async () => {
    const guard = createGuard('task', 'update');
    const context = makeContext({
      method: 'POST',
      body: { entityType: 'finding' },
      headers: {},
      isApiKey: true,
    });
    (
      context.switchToHttp().getRequest() as { apiKeyScopes: string[] }
    ).apiKeyScopes = ['task:update']; // wrong scope
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects service tokens whose allowlist lacks the resolved permission', async () => {
    resolveServiceByNameMock.mockReturnValueOnce({
      permissions: ['task:update'],
    });
    const guard = createGuard('task', 'update');
    const context = makeContext({
      method: 'POST',
      body: { entityType: 'finding' },
      headers: {},
      isServiceToken: true,
    });
    (
      context.switchToHttp().getRequest() as { serviceName: string }
    ).serviceName = 'svc-test';
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('allows service tokens whose allowlist includes the resolved permission', async () => {
    resolveServiceByNameMock.mockReturnValueOnce({
      permissions: ['finding:update'],
    });
    const guard = createGuard('task', 'update');
    const context = makeContext({
      method: 'POST',
      body: { entityType: 'finding' },
      headers: {},
      isServiceToken: true,
    });
    (
      context.switchToHttp().getRequest() as { serviceName: string }
    ).serviceName = 'svc-test';
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('returns true without invoking evaluator for platform admins', async () => {
    const guard = createGuard('task', 'update');
    const context = makeContext({
      method: 'POST',
      body: { entityType: 'finding' },
      headers: {},
      isPlatformAdmin: true,
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(hasPermissionsMock).not.toHaveBeenCalled();
  });

  it('returns true when no @RequirePermission metadata is set (endpoint opted out)', async () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const guard = new CommentsPermissionGuard(reflector, permissionEvaluator);
    const context = makeContext({
      method: 'POST',
      body: { entityType: 'finding' },
      headers: {},
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
