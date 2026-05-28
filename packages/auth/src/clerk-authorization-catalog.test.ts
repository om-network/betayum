import { describe, expect, it } from 'bun:test';
import {
  CLERK_ORGANIZATION_PERMISSION_KEYS,
  getCompAiPermissionActions,
  isCompAiPermissionResource,
  isValidCompAiPermission,
  parseClerkOrganizationPermissionKey,
  toClerkOrganizationPermissionKey,
  toClerkOrganizationPermissionKeys,
} from './clerk-authorization-catalog';
import { statement } from './permissions';

describe('clerk authorization catalog', () => {
  it('maps a product permission to a Clerk organization custom permission key', () => {
    const key = toClerkOrganizationPermissionKey({
      resource: 'policy',
      action: 'read',
    });

    expect(key).toBe('org:policy:read');
  });

  it('publishes a key for every current product permission', () => {
    const expected = Object.entries(statement).flatMap(([resource, actions]) =>
      actions.map((action) => `org:${resource}:${action}`),
    );

    const actual = CLERK_ORGANIZATION_PERMISSION_KEYS.map(String);

    expect(actual).toHaveLength(expected.length);
    expect(new Set(actual)).toEqual(new Set(expected));
  });

  it('rejects unknown resources', () => {
    expect(isCompAiPermissionResource('missing')).toBe(false);
    expect(getCompAiPermissionActions('missing')).toEqual([]);
    expect(
      parseClerkOrganizationPermissionKey({
        resource: 'missing',
        action: 'read',
      }),
    ).toBeNull();
  });

  it('rejects invalid actions for a known resource', () => {
    expect(isValidCompAiPermission({ resource: 'policy', action: 'publish' })).toBe(false);
    expect(
      parseClerkOrganizationPermissionKey({
        resource: 'policy',
        action: 'publish',
      }),
    ).toBeNull();
  });

  it('maps multiple product permissions and fails fast on invalid input', () => {
    expect(
      toClerkOrganizationPermissionKeys([
        { resource: 'policy', action: 'read' },
        { resource: 'evidence', action: 'update' },
      ]),
    ).toEqual(['org:policy:read', 'org:evidence:update']);

    expect(() =>
      toClerkOrganizationPermissionKeys([
        { resource: 'policy', action: 'read' },
        { resource: 'evidence', action: 'publish' },
      ]),
    ).toThrow('Invalid Comp AI permission: evidence:publish');
  });
});
