import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockClerkAuth = vi.fn();
const mockServerApiGet = vi.fn();
const mockServerApiPost = vi.fn();
const mockCreateSupportContextPayload = vi.fn();
const mockSignSupportContext = vi.fn();

vi.mock('@/env.mjs', () => ({
  env: {
    AUTH_SECRET: 'test-secret',
  },
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => mockClerkAuth(),
}));

vi.mock('@/lib/api-server', () => ({
  serverApi: {
    get: (...args: unknown[]) => mockServerApiGet(...args),
    post: (...args: unknown[]) => mockServerApiPost(...args),
    delete: vi.fn(),
  },
}));

vi.mock('@trycompai/utils/support-context', () => ({
  SUPPORT_CONTEXT_COOKIE: 'comp_support_context',
  createSupportContextPayload: (...args: unknown[]) => mockCreateSupportContextPayload(...args),
  parseSupportContext: vi.fn(),
  signSupportContext: (...args: unknown[]) => mockSignSupportContext(...args),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(),
  })),
  headers: vi.fn(async () => new Headers([['host', 'app.trycomp.ai']])),
}));

import { POST } from './route';

describe('POST /api/admin/support-context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClerkAuth.mockResolvedValue({ userId: 'user_clerk_123' });
    mockServerApiGet.mockResolvedValue({
      data: { user: { id: 'usr_actor_123' } },
      error: null,
      status: 200,
    });
    mockServerApiPost.mockResolvedValue({
      data: {
        organizationId: 'org_123',
        organizationName: 'Acme',
        targetUserId: 'usr_target_123',
        targetUserName: 'Target User',
        targetUserEmail: 'target@example.com',
      },
      error: null,
      status: 200,
    });
    mockCreateSupportContextPayload.mockImplementation(
      ({ actorUserId, ...rest }: Record<string, unknown>) => ({
        actorUserId,
        ...rest,
      }),
    );
    mockSignSupportContext.mockReturnValue('signed-cookie');
  });

  it('signs support context with the mapped Comp AI actor user id', async () => {
    const response = await POST(
      new Request('http://localhost/api/admin/support-context', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: 'org_123',
          targetUserId: 'usr_target_123',
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockServerApiGet).toHaveBeenCalledWith('/v1/auth/me');
    expect(mockCreateSupportContextPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'usr_actor_123',
        organizationId: 'org_123',
        targetUserId: 'usr_target_123',
      }),
    );
    expect(mockCreateSupportContextPayload).not.toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'user_clerk_123',
      }),
    );
  });
});
