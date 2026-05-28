import { HIPAA_TRAINING_ID } from '@/lib/data/hipaa-training-content';
import { hasPermission } from '@/lib/permissions';
import { resolveCurrentUserPermissions } from '@/lib/permissions.server';
import { serverApi } from '@/lib/server-api-client';
import { db } from '@db/server';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import type {
  BackgroundCheckBillingStatus,
  BackgroundCheckRecord,
} from './components/backgroundCheckTypes';
import { Employee } from './components/Employee';
import {
  getEmployee,
  getFleetPolicies,
  getMemberDevice,
  getPoliciesTasks,
  getTrainingVideos,
} from './employee-data';

export default async function EmployeeDetailsPage({
  params,
}: {
  params: Promise<{ employeeId: string; orgId: string }>;
}) {
  const { employeeId, orgId } = await params;

  const permissions = await resolveCurrentUserPermissions(orgId);
  const canEditMembers = permissions ? hasPermission(permissions, 'member', 'update') : false;

  if (!orgId) {
    redirect('/');
  }

  const [
    policies,
    employeeTrainingVideos,
    employee,
    hipaaCompletion,
    backgroundCheckRes,
    backgroundCheckBillingRes,
  ] = await Promise.all([
    getPoliciesTasks({ organizationId: orgId }),
    getTrainingVideos(employeeId),
    getEmployee({ employeeId, organizationId: orgId }),
    db.employeeTrainingVideoCompletion.findFirst({
      where: { memberId: employeeId, videoId: HIPAA_TRAINING_ID },
    }),
    serverApi.get<BackgroundCheckRecord | null>(
      `/v1/people/${employeeId}/background-check`,
      { 'X-Organization-Id': orgId },
    ),
    serverApi.get<BackgroundCheckBillingStatus>(
      '/v1/background-check-billing/status',
      { 'X-Organization-Id': orgId },
    ),
  ]);

  // If employee doesn't exist, show 404 page
  if (!employee) {
    notFound();
  }

  const [organization, hipaaFramework] = await Promise.all([
    db.organization.findUnique({ where: { id: orgId } }),
    db.frameworkInstance.findFirst({
      where: { organizationId: orgId, framework: { name: 'HIPAA' } },
      select: { id: true },
    }),
  ]);

  if (!organization) {
    notFound();
  }

  const { fleetPolicies, device } = await getFleetPolicies(employee);
  const memberDevice = await getMemberDevice({
    memberId: employee.id,
    organizationId: orgId,
  });

  return (
    <Employee
      employee={employee}
      policies={policies}
      trainingVideos={employeeTrainingVideos}
      fleetPolicies={fleetPolicies}
      host={device}
      canEdit={canEditMembers}
      organization={organization}
      memberDevice={memberDevice}
      orgId={orgId}
      hasHipaaFramework={!!hipaaFramework}
      hipaaCompletedAt={hipaaCompletion?.completedAt ?? null}
      initialBackgroundCheck={backgroundCheckRes.data ?? null}
      initialBackgroundCheckBillingStatus={
        backgroundCheckBillingRes.data ?? {
          hasPaymentMethod: false,
          setupAt: null,
        }
      }
      backgroundCheckStepEnabled={organization.backgroundCheckStepEnabled === true}
      memberBackgroundCheckExempt={employee.backgroundCheckExempt === true}
    />
  );
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Employee Details',
  };
}
