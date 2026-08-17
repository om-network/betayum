import type { GcpContext, GithubContext } from './system-prompt';

export type IntegrationConnection = {
  providerName?: string;
  providerSlug: string;
  status: string;
  variables?: Record<string, unknown>;
};

export type IntegrationContext = {
  connections: Array<{
    knownValues: string[];
    provider: string;
    status: string;
  }>;
};

const SENSITIVE_KEY_PATTERN = /credential|password|secret|token|private|api[_-]?key/i;

function formatKnownValue(key: string, value: unknown): string | null {
  if (SENSITIVE_KEY_PATTERN.test(key)) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return `${key}: ${String(value)}`;
  }
  if (
    Array.isArray(value) &&
    value.every(
      (item) => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean',
    )
  ) {
    return `${key}: ${value.map(String).join(', ')}`;
  }
  return null;
}

export function buildAutomationPlatformContext(connections: IntegrationConnection[]): {
  gcpContext: GcpContext;
  githubContext: GithubContext;
  integrationContext: IntegrationContext;
} {
  const gcpConnections = connections.filter((connection) => connection.providerSlug === 'gcp');
  const gcpConnection =
    gcpConnections.find((connection) => connection.status === 'active') ?? gcpConnections[0];
  const githubConnections = connections.filter(
    (connection) => connection.providerSlug === 'github',
  );
  const githubConnection =
    githubConnections.find((connection) => connection.status === 'active') ?? githubConnections[0];

  return {
    gcpContext: gcpConnection
      ? {
          apiAvailable: gcpConnection.status === 'active',
          projectIds: Array.isArray(gcpConnection.variables?.project_ids)
            ? (gcpConnection.variables.project_ids as string[])
            : [],
          organizationId:
            typeof gcpConnection.variables?.organization_id === 'string'
              ? gcpConnection.variables.organization_id
              : undefined,
        }
      : null,
    githubContext: githubConnection
      ? {
          apiAvailable: githubConnection.status === 'active',
          orgs: Array.isArray(githubConnection.variables?.orgs)
            ? (githubConnection.variables.orgs as string[])
            : [],
        }
      : null,
    integrationContext: {
      connections: connections.map((connection) => ({
        provider: connection.providerName ?? connection.providerSlug,
        status: connection.status,
        knownValues: Object.entries(connection.variables ?? {}).flatMap(([key, value]) => {
          const formatted = formatKnownValue(key, value);
          return formatted ? [formatted] : [];
        }),
      })),
    },
  };
}
