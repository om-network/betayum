/**
 * AUTHZ-VULN-01 regression: ensure the `secret` resource is granted only to
 * roles that should see DECRYPTED plaintext credentials.
 *
 * The secrets manager surfaces decrypted values to the user — read access on
 * this resource MUST never be implicit (e.g. via `organization:read`) because
 * read-only auditors would otherwise gain access to plaintext credentials.
 *
 * The permission definitions are now standalone, so this spec can import them
 * directly without any auth-runtime shims.
 */
import {
  BUILT_IN_ROLE_PERMISSIONS,
  statement,
} from '@trycompai/auth';

describe('Secrets resource — role grants', () => {
  const fullCrud = ['create', 'read', 'update', 'delete'];

  it('declares secret in the permission statement schema', () => {
    expect(statement.secret).toEqual(
      expect.arrayContaining(['create', 'read', 'update', 'delete']),
    );
  });

  describe('owner role', () => {
    it('should be granted secret CRUD', () => {
      const perms = BUILT_IN_ROLE_PERMISSIONS.owner;
      expect(perms.secret).toEqual(expect.arrayContaining(fullCrud));
    });
  });

  describe('admin role', () => {
    it('should be granted secret CRUD', () => {
      const perms = BUILT_IN_ROLE_PERMISSIONS.admin;
      expect(perms.secret).toEqual(expect.arrayContaining(fullCrud));
    });
  });

  describe('auditor role', () => {
    // Read-only compliance reviewer. They must NEVER see DECRYPTED secrets.
    it('MUST NOT be granted any secret action', () => {
      const perms = BUILT_IN_ROLE_PERMISSIONS.auditor;
      expect(perms.secret).toBeUndefined();
    });

    it('MUST NOT have secret:read (regression for AUTHZ-VULN-01)', () => {
      const perms = BUILT_IN_ROLE_PERMISSIONS.auditor;
      expect(perms.secret ?? []).not.toContain('read');
    });
  });

  describe('employee role', () => {
    it('MUST NOT be granted any secret action', () => {
      const perms = BUILT_IN_ROLE_PERMISSIONS.employee;
      expect(perms.secret).toBeUndefined();
    });
  });

  describe('contractor role', () => {
    it('MUST NOT be granted any secret action', () => {
      const perms = BUILT_IN_ROLE_PERMISSIONS.contractor;
      expect(perms.secret).toBeUndefined();
    });
  });
});
