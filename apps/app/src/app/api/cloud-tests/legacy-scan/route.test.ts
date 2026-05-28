import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockResolveCurrentUserOrganizationContext = vi.fn();
const triggerMocks = vi.hoisted(() => ({
  retrieve: vi.fn(),
  trigger: vi.fn(),
}));

vi.mock('@/lib/permissions.server', () => ({
  resolveCurrentUserOrganizationContext: (...args: unknown[]) =>
    mockResolveCurrentUserOrganizationContext(...args),
}));

vi.mock('@/lib/permissions', () => ({
  hasPermission: (
    permissions: Record<string, string[]>,
    resource: string,
    action: string,
  ) => permissions[resource]?.includes(action) ?? false,
}));

vi.mock('@/trigger/tasks/integration/run-integration-tests', () => ({
  runIntegrationTests: {},
}));

vi.mock('@trigger.dev/sdk', () => ({
  runs: {
    retrieve: triggerMocks.retrieve,
  },
  tasks: {
    trigger: triggerMocks.trigger,
  },
}));

import { POST } from './route';

function request(body: Record<string, unknown> = {}) {
  return new NextRequest('https://app.test/api/cloud-tests/legacy-scan', {
    method: 'POST',
    headers: { 'X-Organization-Id': 'org_1' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/cloud-tests/legacy-scan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveCurrentUserOrganizationContext.mockResolvedValue({
      organizationId: 'org_1',
      userId: 'usr_1',
      permissions: { integration: ['update'] },
    });
    triggerMocks.trigger.mockResolvedValue({ id: 'run_1' });
    triggerMocks.retrieve.mockResolvedValue({
      id: 'run_1',
      isCancelled: false,
      isCompleted: true,
      isFailed: false,
      isSuccess: true,
      output: { success: true },
    });
  });

  it('returns 400 when no organization is provided', async () => {
    const res = await POST(
      new NextRequest('https://app.test/api/cloud-tests/legacy-scan', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );

    expect(res.status).toBe(400);
  });

  it('returns 403 when Clerk-backed permissions deny integration update', async () => {
    mockResolveCurrentUserOrganizationContext.mockResolvedValueOnce({
      organizationId: 'org_1',
      userId: 'usr_1',
      permissions: {},
    });

    const res = await POST(request());

    expect(res.status).toBe(403);
    expect(triggerMocks.trigger).not.toHaveBeenCalled();
  });

  it('triggers the scan for the provided organization and integration', async () => {
    const res = await POST(request({ integrationId: 'int_1' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, taskId: 'run_1' });
    expect(triggerMocks.trigger).toHaveBeenCalledWith('run-integration-tests', {
      organizationId: 'org_1',
      integrationId: 'int_1',
    });
  });
});
