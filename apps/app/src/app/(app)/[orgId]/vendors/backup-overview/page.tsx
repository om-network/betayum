import { VendorOverview } from '@/app/(app)/[orgId]/vendors/backup-overview/components/charts/vendor-overview';
import type { Metadata } from 'next';

export default async function VendorManagement({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;

  return (
    <div className="space-y-4 sm:space-y-8">
      <VendorOverview organizationId={orgId} />
    </div>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Vendors',
  };
}
