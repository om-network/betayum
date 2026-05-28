import { getFleetInstance } from '@/lib/fleet';
import {
  type TrainingVideo,
  trainingVideos as trainingVideosData,
} from '@/lib/data/training-videos';
import type { EmployeeTrainingVideoCompletion, Member, User } from '@db';
import { db } from '@db/server';
import { daysSinceCheckIn, getDeviceComplianceStatus } from '@trycompai/utils/devices';
import type { CheckDetails, DeviceWithChecks } from '../devices/types';

const MDM_POLICY_ID = -9999;

export const getEmployee = async ({
  employeeId,
  organizationId,
}: {
  employeeId: string;
  organizationId: string;
}) => {
  const employee = await db.member.findFirst({
    where: {
      id: employeeId,
      organizationId,
    },
    include: {
      user: true,
    },
  });

  return employee;
};

export const getPoliciesTasks = async ({ organizationId }: { organizationId: string }) => {
  const policies = await db.policy.findMany({
    where: {
      organizationId,
      status: 'published',
      isRequiredToSign: true,
      isArchived: false,
    },
    orderBy: {
      name: 'asc',
    },
  });

  return policies;
};

export const getTrainingVideos = async (employeeId: string) => {
  const employeeTrainingVideos = await db.employeeTrainingVideoCompletion.findMany({
    where: {
      memberId: employeeId,
    },
    orderBy: {
      videoId: 'asc',
    },
  });

  return employeeTrainingVideos
    .map((dbVideo) => {
      const videoMetadata = trainingVideosData.find(
        (metadataVideo) => metadataVideo.id === dbVideo.videoId,
      );

      if (!videoMetadata) return null;

      return {
        ...dbVideo,
        metadata: videoMetadata,
      };
    })
    .filter(
      (
        video,
      ): video is EmployeeTrainingVideoCompletion & {
        metadata: TrainingVideo;
      } => video !== null,
    );
};

export const getFleetPolicies = async (member: Member & { user: User }) => {
  const fleet = await getFleetInstance();

  if (!member.fleetDmLabelId) {
    console.log(
      `No individual fleetDmLabelId found for member: ${member.id}, member email: ${member.user?.email}. No device will be shown.`,
    );
    return { fleetPolicies: [], device: null };
  }

  try {
    const deviceResponse = await fleet.get(`/labels/${member.fleetDmLabelId}/hosts`);
    const device = deviceResponse.data.hosts?.[0];

    if (!device) {
      console.log(
        `No device found for fleetDmLabelId: ${member.fleetDmLabelId} for member: ${member.id}`,
      );
      return { fleetPolicies: [], device: null };
    }

    const deviceWithPolicies = await fleet.get(`/hosts/${device.id}`);
    const host = deviceWithPolicies.data.host;

    const results = await db.fleetPolicyResult.findMany({
      where: {
        organizationId: member.organizationId,
        userId: member.userId,
      },
      orderBy: { createdAt: 'desc' },
    });

    const platform = host.platform?.toLowerCase();
    const osVersion = host.os_version?.toLowerCase();
    const isMacOS =
      platform === 'darwin' ||
      platform === 'macos' ||
      platform === 'osx' ||
      osVersion?.includes('mac');

    return {
      fleetPolicies: [
        ...(host.policies || []),
        ...(isMacOS
          ? [
              {
                id: MDM_POLICY_ID,
                name: 'MDM Enabled',
                response: host.mdm.connected_to_fleet ? 'pass' : 'fail',
              },
            ]
          : []),
      ].map((policy) => {
        const policyResult = results.find((result) => result.fleetPolicyId === policy.id);
        return {
          ...policy,
          response:
            policy.response === 'pass' || policyResult?.fleetPolicyResponse === 'pass'
              ? 'pass'
              : 'fail',
          attachments: policyResult?.attachments || [],
        };
      }),
      device: host,
    };
  } catch (error) {
    console.error(
      `Failed to get device using individual fleet label for member: ${member.id}`,
      error,
    );
    return { fleetPolicies: [], device: null };
  }
};

export const getMemberDevice = async ({
  memberId,
  organizationId,
}: {
  memberId: string;
  organizationId: string;
}): Promise<DeviceWithChecks | null> => {
  const device = await db.device.findFirst({
    where: { memberId, organizationId },
    include: {
      member: {
        include: {
          user: {
            select: { name: true, email: true },
          },
        },
      },
      agentSession: {
        select: { expiresAt: true },
      },
    },
    orderBy: { installedAt: 'desc' },
  });

  if (!device) {
    return null;
  }

  const complianceStatus = getDeviceComplianceStatus({
    isCompliant: device.isCompliant,
    lastCheckIn: device.lastCheckIn,
  });

  return {
    id: device.id,
    name: device.name,
    hostname: device.hostname,
    platform: device.platform as 'macos' | 'windows' | 'linux',
    osVersion: device.osVersion,
    serialNumber: device.serialNumber,
    hardwareModel: device.hardwareModel,
    isCompliant: device.isCompliant,
    diskEncryptionEnabled: device.diskEncryptionEnabled,
    antivirusEnabled: device.antivirusEnabled,
    passwordPolicySet: device.passwordPolicySet,
    screenLockEnabled: device.screenLockEnabled,
    checkDetails: (device.checkDetails as CheckDetails) ?? null,
    lastCheckIn: device.lastCheckIn?.toISOString() ?? null,
    agentVersion: device.agentVersion,
    installedAt: device.installedAt.toISOString(),
    user: {
      name: device.member.user.name,
      email: device.member.user.email,
    },
    source: 'device_agent' as const,
    complianceStatus,
    daysSinceLastCheckIn: daysSinceCheckIn(device.lastCheckIn),
    hasActiveAgentSession:
      !!device.agentSession && device.agentSession.expiresAt.getTime() > Date.now(),
  };
};
