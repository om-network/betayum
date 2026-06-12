const mockDb = {
  organization: { findUnique: jest.fn() },
  member: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
  policy: { findUnique: jest.fn() },
  vendor: { findUnique: jest.fn() },
  risk: { findUnique: jest.fn() },
  device: { findUnique: jest.fn() },
  evidenceSubmission: { findUnique: jest.fn() },
};

jest.mock('@db', () => ({
  db: mockDb,
  FindingArea: {
    people: 'people',
    documents: 'documents',
    compliance: 'compliance',
  },
  FindingStatus: {
    open: 'open',
    ready_for_review: 'ready_for_review',
    needs_revision: 'needs_revision',
    closed: 'closed',
  },
  FindingType: { soc2: 'soc2', iso27001: 'iso27001' },
}));

jest.mock('@trycompai/email', () => ({
  isUserUnsubscribed: jest.fn().mockResolvedValue(false),
}));

jest.mock('../email/trigger-email', () => ({
  triggerEmail: jest.fn().mockResolvedValue({ id: 'email_1' }),
}));

jest.mock('../email/templates/finding-notification', () => ({
  FindingNotificationEmail: () => null,
}));

import { FindingNotifierService } from './finding-notifier.service';

function makeFinding(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fnd_1',
    type: 'soc2',
    content: 'Missing evidence',
    area: null,
    taskId: null,
    evidenceSubmissionId: null,
    evidenceFormType: null,
    policyId: null,
    vendorId: null,
    riskId: null,
    memberId: null,
    deviceId: null,
    createdById: 'mem_actor',
    ...overrides,
  };
}

describe('FindingNotifierService', () => {
  let service: FindingNotifierService;
  const novu = { trigger: jest.fn().mockResolvedValue(undefined) };
  const rolesService = {
    filterMembersWithPermission: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    rolesService.filterMembersWithPermission.mockImplementation(
      async (
        _organizationId: string,
        members: Array<{ role: string | null }>,
      ) =>
        members.filter((member) =>
          (member.role ?? '')
            .split(',')
            .map((role) => role.trim())
            .some((role) => role === 'owner' || role === 'admin'),
        ),
    );
    service = new FindingNotifierService(novu as never, rolesService);
  });

  it('notifies org owners+admins when a policy-scoped finding is created', async () => {
    mockDb.organization.findUnique.mockResolvedValue({ name: 'Acme' });
    mockDb.policy.findUnique.mockResolvedValue({
      assignee: { userId: 'usr_assignee' },
    });
    mockDb.member.findMany.mockResolvedValue([
      {
        role: 'admin',
        user: { id: 'usr_admin', email: 'admin@acme.com', name: 'Admin' },
      },
      {
        role: 'owner',
        user: { id: 'usr_owner', email: 'owner@acme.com', name: 'Owner' },
      },
    ]);
    mockDb.member.findFirst.mockResolvedValue({
      user: {
        id: 'usr_assignee',
        email: 'assignee@acme.com',
        name: 'Assignee',
      },
    });
    mockDb.user.findUnique.mockResolvedValue({
      id: 'usr_assignee',
      email: 'assignee@acme.com',
      name: 'Assignee',
    });

    await service.notifyFindingCreated({
      organizationId: 'org_1',
      finding: makeFinding({
        policyId: 'pol_1',
        policy: { id: 'pol_1', name: 'Access Policy' },
      }) as never,
      actorUserId: 'usr_actor',
      actorName: 'Actor',
    });

    expect(novu.trigger).toHaveBeenCalled();
    // Assignee + two admins/owners — actor excluded, no duplicates
    expect(novu.trigger.mock.calls.length).toBe(3);
  });

  it('does nothing when no recipients resolve (actor is the only admin)', async () => {
    mockDb.organization.findUnique.mockResolvedValue({ name: 'Acme' });
    mockDb.member.findMany.mockResolvedValue([
      {
        role: 'admin',
        user: { id: 'usr_actor', email: 'actor@acme.com', name: 'Actor' },
      },
    ]);

    await service.notifyFindingCreated({
      organizationId: 'org_1',
      finding: makeFinding({ area: 'compliance' }) as never,
      actorUserId: 'usr_actor',
      actorName: 'Actor',
    });

    expect(novu.trigger).not.toHaveBeenCalled();
  });

  it('does not notify members with admin or owner only as a role substring', async () => {
    mockDb.organization.findUnique.mockResolvedValue({ name: 'Acme' });
    mockDb.member.findMany.mockResolvedValue([
      {
        role: 'domain-admin-reviewer',
        user: { id: 'usr_domain', email: 'domain@acme.com', name: 'Domain' },
      },
      {
        role: 'owner-lite',
        user: { id: 'usr_lite', email: 'lite@acme.com', name: 'Lite' },
      },
      {
        role: 'owner',
        user: { id: 'usr_owner', email: 'owner@acme.com', name: 'Owner' },
      },
    ]);

    await service.notifyFindingCreated({
      organizationId: 'org_1',
      finding: makeFinding({ area: 'compliance' }) as never,
      actorUserId: 'usr_actor',
      actorName: 'Actor',
    });

    expect(novu.trigger).toHaveBeenCalledTimes(1);
    expect(novu.trigger.mock.calls[0][0].email).toBe('owner@acme.com');
  });
});
