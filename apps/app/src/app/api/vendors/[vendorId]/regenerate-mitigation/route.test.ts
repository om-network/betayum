import { vi } from 'vitest';

vi.mock('@/trigger/tasks/onboarding/generate-vendor-mitigation', () => ({
  generateVendorMitigation: {},
}));
vi.mock('@/lib/api-server', () => ({
  serverApi: { get: vi.fn() },
}));
vi.mock('@/lib/permissions.server', () => ({
  requireApiPermission: vi.fn(),
}));
vi.mock('@trigger.dev/sdk', () => ({
  auth: { createPublicToken: vi.fn() },
  tasks: { trigger: vi.fn() },
}));

import { selectVendorMitigationAuthor } from './route';

const people = [
  {
    id: 'member-owner-lite',
    role: 'owner-lite',
    deactivated: false,
    user: {
      id: 'user-owner-lite',
      name: 'Owner Lite',
      email: 'owner-lite@example.com',
    },
  },
  {
    id: 'member-domain-admin',
    role: 'domain-admin-reviewer',
    deactivated: false,
    user: {
      id: 'user-domain-admin',
      name: 'Domain Admin',
      email: 'domain-admin@example.com',
    },
  },
  {
    id: 'member-admin',
    role: 'admin',
    deactivated: false,
    user: {
      id: 'user-admin',
      name: 'Admin',
      email: 'admin@example.com',
    },
  },
];

describe('selectVendorMitigationAuthor', () => {
  it('ignores substring-only roles and chooses the first exact owner or admin', () => {
    expect(selectVendorMitigationAuthor(people)?.id).toBe('member-admin');
  });
});
