import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockResolveCurrentUserOrganizationContext = vi.fn();

vi.mock('@/lib/permissions.server', () => ({
  resolveCurrentUserOrganizationContext: (...args: unknown[]) =>
    mockResolveCurrentUserOrganizationContext(...args),
}));

vi.mock('@/lib/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/permissions')>();
  return {
    ...actual,
    hasPermission: actual.hasPermission,
  };
});

vi.mock('@db/server', () => ({
  db: {
    device: {
      findMany: vi.fn(),
    },
  },
}));

import { db } from '@db/server';
import { GET } from './route';

const mockedFindMany = vi.mocked(
  (db as unknown as { device: { findMany: ReturnType<typeof vi.fn> } }).device.findMany,
);

// Freeze "now" so day math is deterministic.
const FIXED_NOW = new Date('2026-04-17T12:00:00.000Z');

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveCurrentUserOrganizationContext.mockResolvedValue({
    organizationId: 'org_1',
    userId: 'usr_1',
    permissions: { member: ['read'] },
  });
});

function request(organizationId = 'org_1') {
  return new NextRequest('https://app.test/api/people/agent-devices', {
    headers: { 'X-Organization-Id': organizationId },
  });
}

function deviceRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'dev_1',
    name: 'Mac',
    hostname: 'mac',
    platform: 'macos',
    osVersion: '14.0',
    serialNumber: 'SN1',
    hardwareModel: 'MBP',
    isCompliant: true,
    diskEncryptionEnabled: true,
    antivirusEnabled: true,
    passwordPolicySet: true,
    screenLockEnabled: true,
    checkDetails: null,
    lastCheckIn: new Date(FIXED_NOW),
    agentVersion: '1.0.0',
    installedAt: new Date('2026-01-01T00:00:00.000Z'),
    memberId: 'mem_1',
    member: { user: { name: 'A', email: 'a@example.com' } },
    ...overrides,
  };
}

describe('GET /api/people/agent-devices', () => {
  it('returns 400 when no organization is provided', async () => {
    const res = await GET(new NextRequest('https://app.test/api/people/agent-devices'));
    expect(res.status).toBe(400);
  });

  it('returns 403 when Clerk-backed permissions deny member read', async () => {
    mockResolveCurrentUserOrganizationContext.mockResolvedValueOnce({
      organizationId: 'org_1',
      userId: 'usr_1',
      permissions: {},
    });

    const res = await GET(request());
    expect(res.status).toBe(403);
  });

  it('marks a fresh + isCompliant device as compliant', async () => {
    mockedFindMany.mockResolvedValue([deviceRow({ lastCheckIn: new Date(FIXED_NOW) })]);
    const res = await GET(request());
    const body = await res.json();
    expect(body.data[0].complianceStatus).toBe('compliant');
    expect(body.data[0].daysSinceLastCheckIn).toBe(0);
  });

  it('marks a fresh + !isCompliant device as non_compliant', async () => {
    mockedFindMany.mockResolvedValue([
      deviceRow({
        isCompliant: false,
        diskEncryptionEnabled: false,
        lastCheckIn: new Date(FIXED_NOW),
      }),
    ]);
    const res = await GET(request());
    const body = await res.json();
    expect(body.data[0].complianceStatus).toBe('non_compliant');
  });

  it('marks a device with lastCheckIn >= 7 days ago as stale', async () => {
    const eightDaysAgo = new Date(FIXED_NOW.getTime() - 8 * 24 * 60 * 60 * 1000);
    mockedFindMany.mockResolvedValue([deviceRow({ lastCheckIn: eightDaysAgo })]);
    const res = await GET(request());
    const body = await res.json();
    expect(body.data[0].complianceStatus).toBe('stale');
    expect(body.data[0].daysSinceLastCheckIn).toBe(8);
  });

  it('marks a device with null lastCheckIn as stale', async () => {
    mockedFindMany.mockResolvedValue([deviceRow({ lastCheckIn: null })]);
    const res = await GET(request());
    const body = await res.json();
    expect(body.data[0].complianceStatus).toBe('stale');
    expect(body.data[0].daysSinceLastCheckIn).toBeNull();
  });

  it('returns hasActiveAgentSession=true for devices with an unexpired linked session, false otherwise', async () => {
    const future = new Date(FIXED_NOW.getTime() + 60 * 60 * 1000); // 1 hour ahead
    const past = new Date(FIXED_NOW.getTime() - 60 * 60 * 1000);   // 1 hour ago

    mockedFindMany.mockResolvedValue([
      deviceRow({ id: 'dev_active', agentSession: { expiresAt: future } }),
      deviceRow({ id: 'dev_none', agentSession: null }),
      deviceRow({ id: 'dev_expired', agentSession: { expiresAt: past } }),
    ]);

    const res = await GET(request());
    const body = await res.json();
    const byId = Object.fromEntries(
      body.data.map((d: { id: string }) => [d.id, d]),
    );

    expect(byId['dev_active'].hasActiveAgentSession).toBe(true);
    expect(byId['dev_none'].hasActiveAgentSession).toBe(false);
    expect(byId['dev_expired'].hasActiveAgentSession).toBe(false);
  });
});
