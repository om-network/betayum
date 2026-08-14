import { serverApi } from '@/lib/api-server';
import { PageHeader, PageLayout, Section, Stack } from '@trycompai/design-system';
import type { ConnectionListItemResponse } from '@trycompai/integration-platform';
import { CodexTerminal } from './[slug]/components/CodexTerminal';
import { PlatformIntegrations } from './components/PlatformIntegrations';

interface TaskApiResponse {
  data: Array<{
    id: string;
    title: string;
    description: string;
    taskTemplateId: string | null;
  }>;
}

interface PageProps {
  params: Promise<{ orgId: string }>;
}

export default async function IntegrationsPage({ params }: PageProps) {
  const { orgId } = await params;

  // Fetch organization's tasks via API
  const [tasksResult, connectionsResult] = await Promise.all([
    serverApi.get<TaskApiResponse>('/v1/tasks'),
    serverApi.get<ConnectionListItemResponse[]>('/v1/integrations/connections'),
  ]);
  const allTasks = tasksResult.data?.data ?? [];

  // Filter to tasks that have a template (can be automated)
  const taskTemplates = allTasks
    .filter((task) => task.taskTemplateId)
    .map((task) => ({
      id: task.taskTemplateId as string,
      taskId: task.id,
      name: task.title,
      description: task.description,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const codexConnection = connectionsResult.data?.find(
    (connection) =>
      (connection.providerSlug === 'gcp' || connection.providerSlug === 'github') &&
      connection.status === 'active',
  );

  return (
    <PageLayout>
      <Stack gap="md">
        <PageHeader title="Integrations" />
        {codexConnection && <CodexTerminal connectionId={codexConnection.id} title="Codex login" />}
        {!codexConnection && (
          <Section title="Codex login" description="Codex CLI session for this organization's VM">
            <div className="border-t py-4">
              <p className="text-sm text-muted-foreground">
                Connect GCP or GitHub to make the organization VM login available.
              </p>
            </div>
          </Section>
        )}
        <PlatformIntegrations taskTemplates={taskTemplates} />
      </Stack>
    </PageLayout>
  );
}
