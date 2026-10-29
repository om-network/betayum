import { serverApi } from '@/lib/api-server';
import { requireRoutePermission } from '@/lib/permissions.server';
import { UsageClient, type UsageSummary } from './UsageClient';

export const metadata = { title: 'Usage' };

export default async function UsagePage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  await requireRoutePermission('usage', orgId);
  const response = await serverApi.get<UsageSummary>('/v1/billing/usage', orgId);
  return <UsageClient organizationId={orgId} initialData={response.data} />;
}
