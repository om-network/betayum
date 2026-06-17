import { describe, expect, it } from 'vitest';
import { createEnterpriseApiUrl } from './enterprise-api-url';

describe('createEnterpriseApiUrl', () => {
  it('rejects absolute endpoints that could override the enterprise API origin', () => {
    expect(() =>
      createEnterpriseApiUrl({
        baseUrl: 'https://enterprise.betayum.com',
        endpoint: 'https://evil.example.com/api/tasks-automations/s3/list',
      }),
    ).toThrow('Enterprise API endpoint must be a relative automation path');
  });

  it('rejects private network production API bases', () => {
    for (const baseUrl of ['https://10.0.0.5', 'https://[::1]', 'https://[fd00::1]']) {
      expect(() =>
        createEnterpriseApiUrl({
          baseUrl,
          endpoint: '/api/tasks-automations/s3/list',
          nodeEnv: 'production',
        }),
      ).toThrow('Enterprise API base URL must not target a private network');
    }
  });

  it('allows localhost only outside production and appends query parameters', () => {
    expect(
      createEnterpriseApiUrl({
        baseUrl: 'http://localhost:3006',
        endpoint: '/api/tasks-automations/s3/list',
        params: { orgId: 'org_123' },
        nodeEnv: 'development',
      }).toString(),
    ).toBe('http://localhost:3006/api/tasks-automations/s3/list?orgId=org_123');
  });
});
