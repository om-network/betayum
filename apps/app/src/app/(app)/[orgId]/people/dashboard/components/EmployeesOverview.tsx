import { filterComplianceMembers } from '@/lib/compliance';
import { HIPAA_TRAINING_ID } from '@/lib/data/hipaa-training-content';
import {
  type TrainingVideo,
  trainingVideos as trainingVideosData,
} from '@/lib/data/training-videos';
import type { EmployeeTrainingVideoCompletion, Member, Organization, Policy, User } from '@db';
import { db } from '@db/server';
import { EmployeeCompletionChart } from './EmployeeCompletionChart';

// Define EmployeeWithUser type similar to EmployeesList
interface EmployeeWithUser extends Member {
  user: User;
}

// Define ProcessedTrainingVideo type
type ProcessedTrainingVideo = EmployeeTrainingVideoCompletion & {
  metadata: TrainingVideo;
};

export async function EmployeesOverview({
  organizationId,
}: {
  organizationId: string;
}) {
  let employees: EmployeeWithUser[] = [];
  let policies: Policy[] = [];
  const processedTrainingVideos: ProcessedTrainingVideo[] = [];
  let organization: Organization | null = null;
  let hasHipaaFramework = false;
  let hipaaCompletions: EmployeeTrainingVideoCompletion[] = [];

  if (organizationId) {
    const [org, hipaaInstance] = await Promise.all([
      db.organization.findUnique({ where: { id: organizationId } }),
      db.frameworkInstance.findFirst({
        where: { organizationId, framework: { name: 'HIPAA' } },
        select: { id: true },
      }),
    ]);
    organization = org;
    hasHipaaFramework = !!hipaaInstance;

    // Fetch employees
    const fetchedMembers = await db.member.findMany({
      where: {
        organizationId: organizationId,
        deactivated: false,
        isActive: true,
      },
      include: {
        user: true,
      },
    });

    employees = await filterComplianceMembers(fetchedMembers, organizationId);

    // Fetch required policies that are published and not archived
    policies = await db.policy.findMany({
      where: {
        organizationId: organizationId,
        isRequiredToSign: true,
        status: 'published',
        isArchived: false,
      },
    });

    if (employees.length > 0 && organization?.securityTrainingStepEnabled !== false) {
      const employeeTrainingVideos = await db.employeeTrainingVideoCompletion.findMany({
        where: {
          memberId: {
            in: employees.map((employee) => employee.id),
          },
        },
      });

      for (const dbVideo of employeeTrainingVideos) {
        const videoMetadata = trainingVideosData.find(
          (metadataVideo) => metadataVideo.id === dbVideo.videoId,
        );

        if (videoMetadata) {
          processedTrainingVideos.push({
            id: dbVideo.id,
            memberId: dbVideo.memberId,
            videoId: dbVideo.videoId,
            completedAt: dbVideo.completedAt,
            metadata: videoMetadata,
          });
        }
      }
    }

    if (employees.length > 0 && hasHipaaFramework) {
      hipaaCompletions = await db.employeeTrainingVideoCompletion.findMany({
        where: {
          memberId: { in: employees.map((e) => e.id) },
          videoId: HIPAA_TRAINING_ID,
        },
      });
    }
  }

  return (
    <div className="grid gap-6">
      <EmployeeCompletionChart
        employees={employees}
        policies={policies}
        trainingVideos={processedTrainingVideos}
        showAll={true}
        securityTrainingStepEnabled={organization?.securityTrainingStepEnabled ?? true}
        hasHipaaFramework={hasHipaaFramework}
        hipaaCompletions={hipaaCompletions}
      />
    </div>
  );
}
