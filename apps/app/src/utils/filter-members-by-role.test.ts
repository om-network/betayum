import { filterMembersByOwnerOrAdmin, hasBuiltInOwnerOrAdminRole } from './filter-members-by-role';

interface TestMember {
  id: string;
  role: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

function makeMember(id: string, role: string): TestMember {
  return {
    id,
    role,
    user: {
      id: `user-${id}`,
      name: `User ${id}`,
      email: `${id}@example.com`,
    },
  };
}

describe('hasBuiltInOwnerOrAdminRole', () => {
  it.each([
    ['owner', true],
    ['admin', true],
    ['employee', false],
    ['contractor', false],
    ['admin,auditor', true],
    ['domain-admin-reviewer', false],
    ['owner-lite', false],
  ])('returns %s for %s', (role, expected) => {
    expect(hasBuiltInOwnerOrAdminRole(role)).toBe(expected);
  });
});

describe('filterMembersByOwnerOrAdmin', () => {
  it('includes exact owner and admin roles while excluding substring-only roles', () => {
    const members = [
      makeMember('owner', 'owner'),
      makeMember('admin', 'admin'),
      makeMember('employee', 'employee'),
      makeMember('contractor', 'contractor'),
      makeMember('combo', 'admin,auditor'),
      makeMember('domain', 'domain-admin-reviewer'),
      makeMember('lite', 'owner-lite'),
    ];

    const result = filterMembersByOwnerOrAdmin({ members });

    expect(result.map((member) => member.id)).toEqual(['owner', 'admin', 'combo']);
  });

  it('preserves currentAssigneeId even when the role is not privileged', () => {
    const members = [makeMember('employee', 'employee'), makeMember('contractor', 'contractor')];

    const result = filterMembersByOwnerOrAdmin({
      members,
      currentAssigneeId: 'contractor',
    });

    expect(result.map((member) => member.id)).toEqual(['contractor']);
  });
});
