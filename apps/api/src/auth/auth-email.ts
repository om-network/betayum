import { MagicLinkEmail, OTPVerificationEmail } from '@trycompai/email';
import { sendEmail } from '../email/resend';
import { InviteEmail } from '../email/templates/invite-member';

// Authentication emails must be deliverable while background workers are offline.
export async function sendAuthMagicLink({
  email,
  url,
}: {
  email: string;
  url: string;
}) {
  await sendEmail({
    to: email,
    subject: 'Login to Betayum',
    react: MagicLinkEmail({ email, url }),
    system: true,
  });
}

export async function sendAuthVerificationOTP({
  email,
  otp,
}: {
  email: string;
  otp: string;
}) {
  await sendEmail({
    to: email,
    subject: 'One-Time Password for Betayum',
    react: OTPVerificationEmail({ email, otp }),
    system: true,
  });
}

export async function sendAuthInvitationEmail(data: {
  email: string;
  organization: { name: string };
  invitation: { id: string };
}) {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.BETTER_AUTH_URL ??
    'https://app.betayum.com';
  await sendEmail({
    to: data.email,
    subject: `You've been invited to join ${data.organization.name} on Betayum`,
    react: InviteEmail({
      organizationName: data.organization.name,
      inviteLink: `${appUrl}/invite/${data.invitation.id}`,
      email: data.email,
    }),
    system: true,
  });
}
