import { getFeatureFlags } from '@/app/posthog';
import { APP_AWS_ORG_ASSETS_BUCKET, s3Client } from '@/app/s3';
import { TriggerTokenProvider } from '@/components/trigger-token-provider';
import { serverApi } from '@/lib/api-server';
import { canAccessApp, canAccessAuditorView, parseRolesString } from '@/lib/permissions';
import { resolveCustomRolePermissions, resolveUserPermissions } from '@/lib/permissions.server';
import { getSignedUrl } from '@/lib/s3-presigner';
import type { OrganizationFromMe } from '@/types';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { auth as clerkAuth } from '@clerk/nextjs/server';
import { db, Role } from '@db/server';
import { OrganizationIdentifier } from '@trycompai/analytics';
import dynamic from 'next/dynamic';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppShellWrapper } from './components/AppShellWrapper';

const HotKeys = dynamic(() => import('@/components/hot-keys').then((mod) => mod.HotKeys), {
  ssr: true,
});

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  const { orgId: requestedOrgId } = await params;

  const cookieStore = await cookies();
  const isCollapsed = cookieStore.get('sidebar-collapsed')?.value === 'true';
  const publicAccessToken = cookieStore.get('publicAccessToken')?.value || undefined;

  const { userId } = await clerkAuth();

  if (!userId) {
    console.log('no session');
    return redirect('/auth');
  }

  // First check if the organization exists and load access flags
  const organization = await db.organization.findUnique({
    where: { id: requestedOrgId },
  });

  if (!organization) {
    // Organization doesn't exist
    return redirect('/auth/not-found');
  }

  // Validate user/org access through the API so Clerk identity mapping and
  // deactivated-member checks stay centralized in the API auth layer.
  const meRes = await serverApi.get<{
    user: {
      id: string;
      email: string;
      name: string | null;
      image: string | null;
      role: string | null;
    } | null;
    organizations: OrganizationFromMe[];
  }>('/v1/auth/me');
  const apiUser = meRes.data?.user;
  const organizations = meRes.data?.organizations ?? [];
  const member = organizations.find((org) => org.id === requestedOrgId);

  if (!apiUser || !member) {
    // User doesn't have access to this organization
    return redirect('/auth/unauthorized');
  }

  // Resolve effective permissions from all roles (built-in + custom)
  const permissions = await resolveUserPermissions(member.memberRole, requestedOrgId);

  // Check if user can access the main app (has app:read or any app route permission)
  const hasAppAccess = canAccessApp(permissions);
  if (!hasAppAccess) {
    return redirect('/no-access');
  }

  // Parse roles for UI display purposes (auditor-specific UI)
  const roles = parseRolesString(member.memberRole);

  const isUserAdmin = apiUser.role === 'admin';

  if (!isUserAdmin) {
    if (!organization.hasAccess) {
      return redirect(`/upgrade/${organization.id}`);
    }

    if (!organization.onboardingCompleted) {
      return redirect(`/onboarding/${organization.id}`);
    }
  }

  const onboarding = await db.onboarding.findFirst({
    where: {
      organizationId: requestedOrgId,
    },
  });

  // Generate logo URLs for all organizations
  const logoUrls: Record<string, string> = {};
  if (s3Client && APP_AWS_ORG_ASSETS_BUCKET) {
    await Promise.all(
      organizations.map(async (org) => {
        if (org.logo) {
          try {
            const command = new GetObjectCommand({
              Bucket: APP_AWS_ORG_ASSETS_BUCKET,
              Key: org.logo,
            });
            logoUrls[org.id] = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
          } catch {
            // Logo not available
          }
        }
      }),
    );
  }

  // Check feature flags for menu items. Security (penetration tests) is
  // always enabled now — the nav rail entry is gated solely by the
  // `pentest:read` permission downstream, matching `security/layout.tsx`.
  let isQuestionnaireEnabled = false;
  let isTrustNdaEnabled = false;
  let isWebAutomationsEnabled = false;
  const isSecurityEnabled = true;
  if (apiUser.id) {
    const flags = await getFeatureFlags(apiUser.id, {
      groups: { organization: organization.id },
    });
    isQuestionnaireEnabled = flags['ai-vendor-questionnaire'] === true;
    isTrustNdaEnabled =
      flags['is-trust-nda-enabled'] === true || flags['is-trust-nda-enabled'] === 'true';
    isWebAutomationsEnabled =
      flags['is-web-automations-enabled'] === true ||
      flags['is-web-automations-enabled'] === 'true';
  }

  // Check auditor role
  const hasAuditorRole = roles.includes(Role.auditor);
  const isOnlyAuditor = hasAuditorRole && roles.length === 1;

  // CS-189: the Auditor View tab follows a stricter rule than bare
  // audit:read — built-in `auditor` role OR a custom role with explicit
  // audit:read. Resolve the custom-role permissions once so we don't
  // second-guess the owner/admin's implicit all-permissions in the UI.
  const customRolePermissions = await resolveCustomRolePermissions(
    member.memberRole,
    requestedOrgId,
  );
  const auditorViewVisible = canAccessAuditorView(member.memberRole, customRolePermissions);

  // User data for navbar
  const user = {
    name: apiUser.name ?? apiUser.email,
    email: apiUser.email,
    image: apiUser.image ?? null,
  };

  return (
    <TriggerTokenProvider
      triggerJobId={onboarding?.triggerJobId || undefined}
      initialToken={publicAccessToken || undefined}
    >
      <OrganizationIdentifier orgId={organization.id} orgName={organization.name} />
      <AppShellWrapper
        organization={organization}
        organizations={organizations}
        logoUrls={logoUrls}
        onboarding={onboarding}
        isCollapsed={isCollapsed}
        isQuestionnaireEnabled={isQuestionnaireEnabled}
        isTrustNdaEnabled={isTrustNdaEnabled}
        isWebAutomationsEnabled={isWebAutomationsEnabled}
        isSecurityEnabled={isSecurityEnabled}
        hasAuditorRole={hasAuditorRole}
        isOnlyAuditor={isOnlyAuditor}
        canAccessAuditorView={auditorViewVisible}
        permissions={permissions}
        user={user}
        isAdmin={isUserAdmin}
      >
        {children}
      </AppShellWrapper>
      <HotKeys />
    </TriggerTokenProvider>
  );
}
