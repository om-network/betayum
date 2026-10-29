import { serverApi } from '@/lib/api-server';
import { hasPermission } from '@/lib/permissions';
import { resolveCurrentUserPermissions } from '@/lib/permissions.server';
import { PageHeader, PageLayout } from '@trycompai/design-system';
import { CreateControlSheet } from './components/CreateControlSheet';
import { ControlsTable } from './components/controls-table';
import type { ControlWithRelations } from './data/queries';
import { parseControlQuery } from './lib/control-query';

interface ControlsPageProps {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const metadata = { title: 'Controls' };

export default async function ControlsPage({ params, searchParams }: ControlsPageProps) {
  const { orgId } = await params;
  const query = parseControlQuery(await searchParams);
  const permissions = await resolveCurrentUserPermissions(orgId);
  const canCreate = hasPermission(permissions ?? {}, 'control', 'create');
  const queryString = new URLSearchParams({
    ...query,
    page: String(query.page),
    perPage: String(query.perPage),
    sortBy: 'name',
  });
  const [controls, options] = await Promise.all([
    serverApi.get<{ data: ControlWithRelations[]; pageCount: number }>(
      `/v1/controls?${queryString}`,
      orgId,
    ),
    canCreate
      ? serverApi.get<Parameters<typeof CreateControlSheet>[0]>('/v1/controls/options', orgId)
      : null,
  ]);
  if (!controls.data || controls.error)
    throw new Error('Unable to load controls. Please try again.');
  return (
    <PageLayout header={<PageHeader title="Controls" />}>
      <ControlsTable promises={Promise.resolve([controls.data])} />
      {canCreate && options?.data && <CreateControlSheet {...options.data} />}
    </PageLayout>
  );
}
