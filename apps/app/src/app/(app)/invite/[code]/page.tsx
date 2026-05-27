import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout';
import { serverApi } from '@/lib/api-server';
import { auth as clerkAuth } from '@clerk/nextjs/server';
import { db } from '@db/server';
import { redirect } from 'next/navigation';
import { AcceptInvite } from '../../setup/components/accept-invite';
import { InviteNotMatchCard } from './components/InviteNotMatchCard';
import { InviteStatusCard } from './components/InviteStatusCard';
import { maskEmail } from './utils';

interface InvitePageProps {
  params: Promise<{ code: string }>;
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { code } = await params;
  const { userId } = await clerkAuth();

  if (!userId) {
    return redirect(`/auth?inviteCode=${code}`);
  }

  const meRes = await serverApi.get<{
    user: { id: string; email: string } | null;
  }>('/v1/auth/me');
  const user = meRes.data?.user;

  if (!user) {
    return redirect(`/auth?inviteCode=${code}`);
  }

  const invitation = await db.invitation.findFirst({
    where: {
      id: code,
    },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!invitation) {
    return (
      <OnboardingLayout variant="setup" currentOrganization={null}>
        <div className="flex min-h-[calc(100dvh-80px)] w-full items-center justify-center p-4">
          <InviteStatusCard
            title="Invite not found"
            description="This invitation code does not exist. Please check the link or ask your admin to resend the invite."
            primaryHref="/"
            primaryLabel="Go home"
          />
        </div>
      </OnboardingLayout>
    );
  }

  if (invitation.status !== 'pending') {
    // Check if the current user is a member of this organization
    // If so, this means they just accepted the invite and we should redirect them
    const membership = await db.member.findFirst({
      where: {
        userId: user.id,
        organizationId: invitation.organizationId,
        deactivated: false,
      },
    });

    if (membership) {
      // User is a member - redirect to the organization
      return redirect(`/${invitation.organizationId}`);
    }

    // User is not a member - show the appropriate message
    return (
      <OnboardingLayout variant="setup" currentOrganization={null}>
        <div className="flex min-h-[calc(100dvh-80px)] w-full items-center justify-center p-4">
          <InviteStatusCard
            title={invitation.status === 'accepted' ? 'Invite already accepted' : 'Invite expired'}
            description={
              invitation.status === 'accepted'
                ? 'This invitation has already been accepted. If you believe this is a mistake, contact your organization admin.'
                : 'This invitation has expired. Please ask your organization admin to send a new invite.'
            }
            primaryHref="/"
            primaryLabel="Go home"
          />
        </div>
      </OnboardingLayout>
    );
  }

  if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
    return (
      <OnboardingLayout variant="setup" currentOrganization={null}>
        <div className="flex min-h-[calc(100dvh-80px)] w-full items-center justify-center p-4">
          <InviteNotMatchCard
            currentEmail={user.email}
            invitedEmail={maskEmail(invitation.email)}
          />
        </div>
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout variant="setup" currentOrganization={null}>
      <div className="flex min-h-[calc(100dvh-80px)] w-full items-center justify-center p-4">
        <AcceptInvite
          inviteCode={invitation.id}
          organizationName={invitation.organization.name || ''}
        />
      </div>
    </OnboardingLayout>
  );
}
