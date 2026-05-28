import { env } from '@/env.mjs';
import { setActiveOrganizationCookie } from '@/lib/active-organization';
import { serverApi } from '@/lib/api-server';
import { auth } from '@/utils/auth';
import { db } from '@db/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { BookingStep } from './components/booking-step';
import { UpgradePageTracking } from './UpgradePageTracking';

interface PageProps {
  params: Promise<{
    orgId: string;
  }>;
}

interface AutoApproveResponse {
  hasAccess: boolean;
  autoApproved: boolean;
  reason: string;
}

export default async function UpgradePage({ params }: PageProps) {
  const { orgId } = await params;

  // Get headers once to avoid multiple async calls
  const requestHeaders = await headers();

  // Check auth
  const authSession = await auth.api.getSession({
    headers: requestHeaders,
  });

  if (!authSession?.user?.id) {
    redirect('/sign-in');
  }

  // Verify user has access to this org before setting the route organization cookie.
  const member = await db.member.findFirst({
    where: {
      organizationId: orgId,
      userId: authSession.user.id,
      deactivated: false,
    },
    include: {
      organization: true,
    },
  });

  if (!member) {
    redirect('/');
  }

  try {
    await setActiveOrganizationCookie(orgId);
  } catch (error) {
    console.error('[UpgradePage] Failed to set active organization cookie:', error);
  }

  let hasAccess = member.organization.hasAccess;

  if (!hasAccess) {
    // Self-hosted instances auto-approve every org. The flag is a Next.js
    // build-time env var (NEXT_PUBLIC_SELF_HOSTED) that the OSS Docker
    // deployment sets on the app container only — the API container does NOT
    // have this env, so the check stays on the page. The DB write here is the
    // single exception to "all mutations through the API" — it's gated on a
    // build-time deploy flag, not user input.
    if (env.NEXT_PUBLIC_SELF_HOSTED === 'true') {
      await db.organization.update({
        where: { id: orgId },
        data: { hasAccess: true },
      });
      hasAccess = true;
    } else {
      // Stripe-domain auto-approval (and the @trycomp.ai shortcut) live in the
      // API so STRIPE_SECRET_KEY only has to exist on the API and the
      // hasAccess flip is RBAC-checked + audit-logged. Soft-fail so a transient
      // API error never blocks the booking step from rendering.
      const response = await serverApi.post<AutoApproveResponse>(
        '/v1/organization-access/auto-approve',
        undefined,
        orgId,
      );

      if (response.data?.hasAccess) {
        hasAccess = true;
      } else if (response.error) {
        console.error('[UpgradePage] auto-approve API error:', response.error);
      }
    }
  }

  // If user has access to org but hasn't completed onboarding, redirect to onboarding
  if (hasAccess && !member.organization.onboardingCompleted) {
    redirect(`/onboarding/${orgId}`);
  }

  // If user has access to org and has completed onboarding, redirect to org
  if (hasAccess && member.organization.onboardingCompleted) {
    redirect(`/${orgId}`);
  }

  // Check if user has other completed orgs (for cancel button)
  const otherOrgCount = await db.member.count({
    where: {
      userId: authSession.user.id,
      organizationId: { not: orgId },
      deactivated: false,
      organization: { onboardingCompleted: true, hasAccess: true },
    },
  });

  return (
    <>
      <UpgradePageTracking />
      <div className="mx-auto px-4 max-w-7xl my-auto min-h-[calc(100vh-10rem)] flex items-center justify-center">
        <BookingStep
          company={member.organization.name}
          orgId={orgId}
          hasAccess={hasAccess}
          hasOtherOrgs={otherOrgCount > 0}
        />
      </div>
    </>
  );
}
