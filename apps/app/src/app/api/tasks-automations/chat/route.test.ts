import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/permissions.server', () => ({
  requireApiPermission: vi.fn(),
}));

import { requireApiPermission } from '@/lib/permissions.server';
import { POST } from './route';

const mockRequireApiPermission = vi.mocked(requireApiPermission);

function createRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/tasks-automations/chat', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/tasks-automations/chat', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.stubEnv('NEXT_PUBLIC_ENTERPRISE_API_URL', 'https://enterprise.test');
    vi.stubEnv('ENTERPRISE_API_SECRET', 'secret_test');
  });

  it('forwards chat requests through the first-party enterprise secret', async () => {
    mockRequireApiPermission.mockResolvedValue({
      organizationId: 'org_123',
      userId: 'usr_123',
      permissions: {},
    });

    const upstreamResponse = new Response('data: {}\n\n', {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
    const fetchMock = vi.fn().mockResolvedValue(upstreamResponse);
    vi.stubGlobal('fetch', fetchMock);

    const body = {
      orgId: 'org_123',
      taskId: 'tsk_123',
      automationId: 'auto_123',
      messages: [],
    };

    const response = await POST(createRequest(body));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('data: {}\n\n');
    expect(mockRequireApiPermission).toHaveBeenCalledWith(expect.any(Request), 'task', 'update');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://enterprise.test/api/tasks-automations/chat',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(body),
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'x-api-secret': 'secret_test',
        }),
      }),
    );
  });

  it('rejects requests for a different active organization', async () => {
    mockRequireApiPermission.mockResolvedValue({
      organizationId: 'org_123',
      userId: 'usr_123',
      permissions: {},
    });

    const response = await POST(
      createRequest({
        orgId: 'org_other',
        taskId: 'tsk_123',
        automationId: 'auto_123',
        messages: [],
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Forbidden');
  });
});
