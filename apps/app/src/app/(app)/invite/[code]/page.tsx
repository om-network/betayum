import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout';
import { InviteStatusCard } from './components/InviteStatusCard';

interface InvitePageProps {
  params: Promise<{ code: string }>;
}

export default async function InvitePage({ params }: InvitePageProps) {
  await params;

  return (
    <OnboardingLayout variant="setup" currentOrganization={null}>
      <div className="flex min-h-[calc(100dvh-80px)] w-full items-center justify-center p-4">
        <InviteStatusCard
          title="Invitation link expired"
          description="Comp AI now uses Clerk organization invitations. Ask your admin to send a new invitation from the people page."
          primaryHref="/auth"
          primaryLabel="Sign in"
        />
      </div>
    </OnboardingLayout>
  );
}
