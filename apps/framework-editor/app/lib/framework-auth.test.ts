import { describe, expect, it } from 'bun:test';
import { canAccessFrameworkEditor, isInternalUser, type FrameworkUser } from './framework-auth';

const internalAdmin: FrameworkUser = {
  id: 'usr_internal',
  email: 'admin@trycomp.ai',
  name: 'Internal Admin',
  image: null,
  role: 'admin',
};

describe('framework editor auth helpers', () => {
  it('allows internal admin users', () => {
    expect(canAccessFrameworkEditor(internalAdmin)).toBe(true);
  });

  it('rejects non-internal users', () => {
    expect(
      canAccessFrameworkEditor({
        ...internalAdmin,
        email: 'admin@example.com',
      }),
    ).toBe(false);
  });

  it('rejects non-admin internal users', () => {
    expect(
      canAccessFrameworkEditor({
        ...internalAdmin,
        role: 'employee',
      }),
    ).toBe(false);
  });

  it('matches only the Comp AI internal domain', () => {
    expect(isInternalUser('admin@trycomp.ai')).toBe(true);
    expect(isInternalUser('admin@sub.trycomp.ai')).toBe(false);
  });
});
