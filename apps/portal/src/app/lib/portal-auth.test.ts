import { describe, expect, it } from 'bun:test';
import { getPortalOrganization, type PortalAuthContext } from './portal-auth';

const authContext: PortalAuthContext = {
  user: {
    id: 'usr_123',
    email: 'employee@example.com',
    name: 'Employee User',
    image: null,
    role: null,
  },
  organizations: [
    {
      id: 'org_allowed',
      name: 'Allowed Org',
      logo: null,
      onboardingCompleted: true,
      hasAccess: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      memberRole: 'employee',
      memberId: 'mem_allowed',
    },
  ],
};

describe('getPortalOrganization', () => {
  it('returns the requested portal organization when the API validated membership', () => {
    expect(getPortalOrganization(authContext, 'org_allowed')?.memberId).toBe('mem_allowed');
  });

  it('returns null for a wrong organization', () => {
    expect(getPortalOrganization(authContext, 'org_other')).toBeNull();
  });
});
