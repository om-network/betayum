'use client';

import { apiClient } from '@/lib/api-client';
import { Button, PageHeader, PageLayout, Section, Stack, Text } from '@trycompai/design-system';
import useSWR from 'swr';
import { BillingUsageTable } from '../settings/billing/BillingUsageTable';
import type { BackgroundCheckBillingStatus } from '../settings/billing/types';

export type UsageSummary = Required<
  Pick<BackgroundCheckBillingStatus, 'subscriptions' | 'usageRows'>
>;

export function UsageClient({
  organizationId,
  initialData,
}: {
  organizationId: string;
  initialData?: UsageSummary;
}) {
  const { data, error, isLoading, mutate } = useSWR(
    ['/v1/billing/usage', organizationId],
    async ([endpoint, orgId]) => {
      const response = await apiClient.get<UsageSummary>(endpoint, orgId);
      if (
        response.error ||
        !Array.isArray(response.data?.subscriptions) ||
        !Array.isArray(response.data?.usageRows)
      ) {
        throw new Error('Unable to load usage. Please try again.');
      }
      return response.data;
    },
    { fallbackData: initialData, revalidateOnMount: !initialData },
  );
  return (
    <PageLayout header={<PageHeader title="Usage" />}>
      <Section
        title="Service usage"
        description="Monthly allowances and recorded service runs for this organization."
      >
        <Stack gap="4">
          <div>
            <Button variant="outline" onClick={() => void mutate()}>
              Refresh usage
            </Button>
          </div>
          {error && (
            <div role="alert">
              <Text>Unable to load usage. Please try again.</Text>
            </div>
          )}
          {isLoading && !data && <Text>Loading usage…</Text>}
          {data && (
            <BillingUsageTable subscriptions={data.subscriptions} usageRows={data.usageRows} />
          )}
        </Stack>
      </Section>
    </PageLayout>
  );
}
