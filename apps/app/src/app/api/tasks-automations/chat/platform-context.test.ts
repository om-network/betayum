import { describe, expect, it } from 'vitest';
import { buildAutomationPlatformContext } from './platform-context';

describe('buildAutomationPlatformContext', () => {
  it('keeps an unavailable API connection as a configured platform', () => {
    const result = buildAutomationPlatformContext([
      {
        providerSlug: 'gcp',
        status: 'error',
        variables: { project_ids: ['project-1'] },
      },
    ]);

    expect(result.gcpContext).toEqual({
      apiAvailable: false,
      projectIds: ['project-1'],
      organizationId: undefined,
    });
    expect(result.githubContext).toBeNull();
  });

  it('prefers an active connection when multiple records exist', () => {
    const result = buildAutomationPlatformContext([
      { providerSlug: 'gcp', status: 'error', variables: { project_ids: ['old'] } },
      { providerSlug: 'gcp', status: 'active', variables: { project_ids: ['current'] } },
    ]);

    expect(result.gcpContext?.apiAvailable).toBe(true);
    expect(result.gcpContext?.projectIds).toEqual(['current']);
  });

  it('includes non-secret known values from every configured integration', () => {
    const result = buildAutomationPlatformContext([
      {
        providerName: 'Google Cloud Platform',
        providerSlug: 'gcp',
        status: 'active',
        variables: {
          project_ids: ['project-1'],
          access_token: 'must-not-appear',
          region: 'us-central1',
        },
      },
    ]);

    expect(result.integrationContext.connections).toEqual([
      {
        provider: 'Google Cloud Platform',
        status: 'active',
        knownValues: ['project_ids: project-1', 'region: us-central1'],
      },
    ]);
  });
});
