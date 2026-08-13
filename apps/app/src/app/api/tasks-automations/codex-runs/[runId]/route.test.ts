import { describe, expect, it, vi } from 'vitest';

const mockGetSession = vi.fn();
const mockServerGet = vi.fn();
vi.mock('@/utils/auth', () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock('@/lib/api-server', () => ({ serverApi: { get: mockServerGet } }));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@trigger.dev/sdk', () => ({ runs: { retrieve: vi.fn() } }));

import { GET } from './route';

describe('GET codex run', () => {
  it('denies a run requested for a different active organization before reading it', async () => {
    mockGetSession.mockResolvedValue({
      user: { id: 'user_1' },
      session: { activeOrganizationId: 'org_active' },
    });

    const response = await GET(
      new Request('http://localhost/api?automationId=aut_1&orgId=org_other&taskId=task_1'),
      { params: Promise.resolve({ runId: 'car_run_1' }) },
    );

    expect(response.status).toBe(403);
    expect(mockServerGet).not.toHaveBeenCalled();
  });
});
