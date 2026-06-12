import { vi } from 'vitest';

vi.mock('@/trigger/tasks/onboarding/generate-risk-mitigation', () => ({
  generateRiskMitigation: {},
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

import { selectRiskMitigationAuthor } from './route';

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
    id: 'member-owner',
    role: 'owner',
    deactivated: false,
    user: {
      id: 'user-owner',
      name: 'Owner',
      email: 'owner@example.com',
    },
  },
];

describe('selectRiskMitigationAuthor', () => {
  it('ignores substring-only roles and chooses the first exact owner or admin', () => {
    expect(selectRiskMitigationAuthor(people)?.id).toBe('member-owner');
  });
});
